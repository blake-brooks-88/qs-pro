type XmlNode = {
  name: string;
  children: XmlNode[];
  text: string;
};

export function parseSoapXml(xml: string): Record<string, unknown> {
  const parsed = parseXml(xml);
  const envelope = parsed.Envelope as Record<string, unknown> | undefined;
  const body =
    (envelope?.Body as Record<string, unknown> | undefined) ??
    (parsed.Body as Record<string, unknown> | undefined);

  if (body) {
    return { Body: body };
  }

  return parsed;
}

function parseXml(xml: string): Record<string, unknown> {
  const root: XmlNode = { name: 'root', children: [], text: '' };
  const stack: XmlNode[] = [root];
  const tokenRegex = /<[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(xml))) {
    const token = match[0];
    if (token.startsWith('<?') || token.startsWith('<!--')) {
      continue;
    }

    if (token.startsWith('</')) {
      const node = stack.pop();
      if (node) {
        const parent = stack[stack.length - 1];
        parent.children.push(node);
      }
      continue;
    }

    if (token.startsWith('<')) {
      const selfClosing = token.endsWith('/>');
      const tagName = normalizeTagName(token);
      const node: XmlNode = { name: tagName, children: [], text: '' };

      if (selfClosing) {
        const parent = stack[stack.length - 1];
        parent.children.push(node);
      } else {
        stack.push(node);
      }

      continue;
    }

    const text = token.trim();
    if (text) {
      const current = stack[stack.length - 1];
      current.text += text;
    }
  }

  const rootObject = nodeToObject(root);
  return (rootObject.root as Record<string, unknown>) || {};
}

function nodeToObject(node: XmlNode): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const child of node.children) {
    const value = child.children.length
      ? nodeToObject(child)[child.name]
      : decodeXml(child.text);
    const existing = result[child.name];

    if (existing !== undefined) {
      result[child.name] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
    } else {
      result[child.name] = value;
    }
  }

  return { [node.name]: result };
}

function normalizeTagName(token: string): string {
  const tagBody = token.replace(/^<|\/?>$/g, '').trim();
  const [rawName] = tagBody.split(/\s+/);
  const name = rawName.replace(/^\/?/, '');
  return name.includes(':') ? name.split(':').pop() || name : name;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
