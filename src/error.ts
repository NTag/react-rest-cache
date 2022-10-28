export class FetchError extends Error {
  public status: number;
  public data: any;

  constructor(public response: Response) {
    super("Fetch error");
  }

  async process() {
    this.status = this.response.status;
    this.data = await this.response.json();
  }
}
