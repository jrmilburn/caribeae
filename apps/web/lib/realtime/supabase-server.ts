// Minimal Supabase realtime server stub to satisfy messaging flows.
// Replace with a real Supabase client/channel implementation if available.
export const inboxTopic = "inbox";
export const convoTopic = (id: string) => `convo:${id}`;

type BroadcastPayload = {
  type: "broadcast";
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
};

class NoopChannel {
  async send(payload?: BroadcastPayload) {
    void payload;
    return { status: "ok" };
  }
}

class NoopSupabaseServer {
  channel(topic?: string) {
    void topic;
    return new NoopChannel();
  }
}

export const supaServer = new NoopSupabaseServer();
