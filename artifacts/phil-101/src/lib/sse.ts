export async function fetchSse(
  url: string,
  options: RequestInit,
  onMessage: (data: any) => void,
  onError: (error: string) => void,
  onComplete: () => void,
) {
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    onComplete();
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      onError(`Request failed with status ${response.status}`);
      finish();
      return;
    }

    const body = response.body;
    if (!body) {
      onError("No response body");
      finish();
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const evt of events) {
        const dataLines = evt
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6));
        if (dataLines.length === 0) continue;
        const dataStr = dataLines.join("\n");
        try {
          const data = JSON.parse(dataStr);
          if (data.error) {
            onError(data.error);
          } else if (data.done) {
            finish();
            return;
          } else {
            onMessage(data);
          }
        } catch (e) {
          console.error("Failed to parse SSE JSON", e, dataStr);
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  } finally {
    finish();
  }
}
