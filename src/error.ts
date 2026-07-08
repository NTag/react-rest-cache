export class FetchError extends Error {
  public status: number;
  public data: any;

  constructor(public response: Response) {
    super(`HTTP ${response.status} error while fetching ${response.url}`);
    this.name = "FetchError";
    this.status = response.status;
  }

  async process() {
    if (this.response.headers.get("content-type")?.includes("json")) {
      this.data = await this.response.json();
    } else {
      this.data = await this.response.text();
    }
  }
}
