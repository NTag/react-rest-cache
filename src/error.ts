export class FetchError extends Error {
  public status: number;
  public data: any;

  constructor(public response: Response) {
    super("Fetch error");
  }

  async process() {
    this.status = this.response.status;
    if (this.response.headers.get("content-type").includes("json")) {
      this.data = await this.response.json();
    } else {
      this.data = await this.response.text();
    }
  }
}
