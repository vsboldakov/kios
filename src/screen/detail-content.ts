let readDetail = (): string | null => null

// The next view can bind before the previous view's cleanup runs.
export function bindDetailContent(read: () => string | null): () => void {
  readDetail = read
  return () => {
    if (readDetail === read) readDetail = () => null
  }
}

export function detailContent(): string | null {
  return readDetail()
}
