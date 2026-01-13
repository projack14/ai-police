declare global {
  class SrsRtcWhipWhepAsync {
    constructor();
    publish(url: string): Promise<any>;
    close(): void;
  }
}

export {};
