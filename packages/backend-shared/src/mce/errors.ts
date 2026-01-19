export class MceOperationError extends Error {
  public readonly terminal = true;

  constructor(
    public readonly operation: string,
    public readonly status: string,
    public readonly statusMessage?: string,
  ) {
    super(
      `MCE ${operation} failed: ${status}${
        statusMessage ? ` - ${statusMessage}` : ""
      }`,
    );
    this.name = "MceOperationError";
  }
}

export class McePaginationError extends Error {
  public readonly terminal = true;

  constructor(
    public readonly operation: string,
    public readonly maxPages: number,
  ) {
    super(
      `MCE ${operation} exceeded max pagination limit of ${maxPages} pages`,
    );
    this.name = "McePaginationError";
  }
}
