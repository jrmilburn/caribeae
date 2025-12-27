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
  async send(_payload: BroadcastPayload) {
    return { status: "ok" };
  }
}

class NoopSupabaseServer {
  channel(_topic: string) {
    return new NoopChannel();
  }
}

export const supaServer = new NoopSupabaseServer();
