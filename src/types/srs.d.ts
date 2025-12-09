declare global {
  class SrsRtcPublisherAsync {
    constructor();
    publish(url: string): Promise<any>;
    close(): void;
  }
}

export {};
