import { AtUri, BskyAgent, RichText } from "@atproto/api";
import type { IncomingReply, PostRef } from "./types";

interface BlueskyServiceConfig {
  identifier: string;
  appPassword: string;
  serviceUrl: string;
  langs: string[];
  dryRun: boolean;
}

interface PostTextOptions {
  text: string;
}

interface PostSceneOptions {
  text: string;
  imagePng: Uint8Array;
  alt: string;
}

function extractTagsFromText(text: string): string[] {
  const tags = new Set<string>();
  const re = /(^|\s)#([\p{L}\p{N}_]{1,64})/gu;

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const tag = match[2];
    if (tag) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

function isThreadViewPost(value: unknown): value is {
  post: {
    uri: string;
    cid: string;
    indexedAt: string;
    author: { did: string };
    record: unknown;
  };
  replies?: unknown[];
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "post" in value;
}

export class BlueskyService {
  private readonly agent: BskyAgent;

  constructor(private readonly config: BlueskyServiceConfig) {
    this.agent = new BskyAgent({ service: this.config.serviceUrl });
  }

  get did(): string {
    return this.agent.session?.did ?? "did:example:dry-run";
  }

  get handle(): string | undefined {
    return this.agent.session?.handle;
  }

  async login(): Promise<void> {
    if (this.config.dryRun) {
      return;
    }

    await this.agent.login({
      identifier: this.config.identifier,
      password: this.config.appPassword,
    });
  }

  async postText(options: PostTextOptions): Promise<PostRef> {
    if (this.config.dryRun) {
      return this.makeDryRunPostRef();
    }

    const rt = new RichText({ text: options.text });
    await rt.detectFacets(this.agent);

    const created = await this.agent.post({
      text: rt.text,
      facets: rt.facets,
      langs: this.config.langs,
      tags: extractTagsFromText(options.text),
    });

    return {
      uri: created.uri,
      cid: created.cid,
    };
  }

  async postScene(options: PostSceneOptions): Promise<PostRef> {
    if (this.config.dryRun) {
      return this.makeDryRunPostRef();
    }

    const rt = new RichText({ text: options.text });
    await rt.detectFacets(this.agent);

    const uploaded = await this.agent.uploadBlob(options.imagePng, { encoding: "image/png" });
    const created = await this.agent.post({
      text: rt.text,
      facets: rt.facets,
      langs: this.config.langs,
      tags: extractTagsFromText(options.text),
      embed: {
        $type: "app.bsky.embed.images",
        images: [
          {
            alt: options.alt,
            image: uploaded.data.blob,
            aspectRatio: {
              width: 160,
              height: 144,
            },
          },
        ],
      },
    });

    return {
      uri: created.uri,
      cid: created.cid,
    };
  }

  async getDirectReplies(postUri: string): Promise<IncomingReply[]> {
    if (this.config.dryRun) {
      return [];
    }

    const response = await this.agent.getPostThread({
      uri: postUri,
      depth: 1,
      parentHeight: 0,
    });

    const thread = response.data.thread;
    if (!isThreadViewPost(thread)) {
      return [];
    }

    const replies: IncomingReply[] = [];
    for (const item of thread.replies ?? []) {
      if (!isThreadViewPost(item)) {
        continue;
      }

      const record = item.post.record as { text?: unknown; createdAt?: unknown };
      if (!record || typeof record !== "object") {
        continue;
      }

      const text = typeof record.text === "string" ? record.text : "";
      if (!text.trim()) {
        continue;
      }

      const createdAt = typeof record.createdAt === "string" ? record.createdAt : item.post.indexedAt;
      replies.push({
        uri: item.post.uri,
        cid: item.post.cid,
        authorDid: item.post.author.did,
        text,
        createdAt,
      });
    }

    return replies;
  }

  async closeReplies(postUri: string): Promise<void> {
    if (this.config.dryRun) {
      return;
    }

    const rkey = new AtUri(postUri).rkey;

    await this.agent.com.atproto.repo.putRecord({
      repo: this.agent.accountDid,
      collection: "app.bsky.feed.threadgate",
      rkey,
      record: {
        $type: "app.bsky.feed.threadgate",
        post: postUri,
        allow: [],
        createdAt: new Date().toISOString(),
      },
    });
  }

  async createRepost(target: PostRef): Promise<string> {
    if (this.config.dryRun) {
      return `at://dry.run/app.bsky.feed.repost/${Math.random().toString(36).slice(2, 12)}`;
    }

    const repost = await this.agent.repost(target.uri, target.cid);
    return repost.uri;
  }

  async deleteRepost(repostUri: string): Promise<void> {
    if (this.config.dryRun) {
      return;
    }

    await this.agent.deleteRepost(repostUri);
  }

  async pinPost(post: PostRef): Promise<void> {
    if (this.config.dryRun) {
      return;
    }

    await this.agent.upsertProfile((existing) => ({
      ...(existing ?? {}),
      pinnedPost: {
        uri: post.uri,
        cid: post.cid,
      },
    }));
  }

  private makeDryRunPostRef(): PostRef {
    const rkey = Math.random().toString(36).slice(2, 14);
    return {
      uri: `at://dry.run/app.bsky.feed.post/${rkey}`,
      cid: `bafydry${rkey}`,
    };
  }
}
