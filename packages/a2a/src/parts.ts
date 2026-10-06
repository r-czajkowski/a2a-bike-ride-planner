import type { Message, Part, Role } from '@a2a-js/sdk';

// Parts are the content of messages and artifacts: text, structured data, or
// files. The v1.0 SDK models them as a `content` union with a `$case` tag; this
// hides the boilerplate.
export class Parts {
  static text(text: string): Part {
    return Parts.make({ $case: 'text', value: text }, 'text/plain');
  }

  static data(data: unknown): Part {
    return Parts.make({ $case: 'data', value: data }, 'application/json');
  }

  static file(filename: string, mediaType: string, text: string): Part {
    return Parts.make(
      { $case: 'raw', value: Buffer.from(text) },
      mediaType,
      filename,
    );
  }

  static textOf(parts: Part[] = []): string {
    return parts
      .map((p) => (p.content?.$case === 'text' ? p.content.value : ''))
      .join('\n')
      .trim();
  }

  static dataOf(parts: Part[] = []): any {
    return parts.find((p) => p.content?.$case === 'data')?.content?.value;
  }

  static fileOf(parts: Part[] = []): string | undefined {
    const file = parts.find((p) => p.content?.$case === 'raw');

    return file?.content?.$case === 'raw'
      ? Buffer.from(file.content.value).toString()
      : undefined;
  }

  static message(
    role: Role,
    parts: Part[],
    taskId = '',
    contextId = '',
  ): Message {
    return {
      messageId: crypto.randomUUID(),
      role,
      parts,
      taskId,
      contextId,
      metadata: {},
      extensions: [],
      referenceTaskIds: [],
    };
  }

  private static make(
    content: Part['content'],
    mediaType: string,
    filename = '',
  ): Part {
    return { content, mediaType, filename, metadata: undefined };
  }
}
