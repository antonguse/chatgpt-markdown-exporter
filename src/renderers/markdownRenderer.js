function normalizeRoleHeading(role) {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (!role) return 'Message';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function stringifyUnknownPart(part) {
  if (typeof part === 'string') return part;
  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

function extractCodeText(part) {
  if (typeof part?.text === 'string') return part.text;
  if (typeof part?.code === 'string') return part.code;
  if (typeof part?.value === 'string') return part.value;
  if (typeof part?.content === 'string') return part.content;
  return stringifyUnknownPart(part);
}

function detectBlockKind(part) {
  if (typeof part === 'string') return 'narrative';
  if (!part || typeof part !== 'object') return 'narrative';

  const contentType = typeof part.content_type === 'string' ? part.content_type : '';
  const type = typeof part.type === 'string' ? part.type : '';

  if (contentType.includes('code') || type.includes('code')) return 'code';
  if (contentType.includes('pre') || contentType.includes('text/plain') || type.includes('pre')) return 'plain_text';

  if (typeof part.language === 'string' && part.language) return 'code';
  return 'narrative';
}

function toContentBlock(part) {
  const kind = detectBlockKind(part);
  const language = typeof part?.language === 'string' && part.language.trim() ? part.language.trim() : null;

  if (kind === 'code') {
    return {
      kind,
      language,
      text: extractCodeText(part)
    };
  }

  if (kind === 'plain_text') {
    return {
      kind,
      language: null,
      text: extractCodeText(part)
    };
  }

  return {
    kind: 'narrative',
    language: null,
    text: stringifyUnknownPart(part)
  };
}

export function buildMessageContentBlocks(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.map((part) => toContentBlock(part));
}

function renderBlock(block) {
  if (block.kind === 'code') {
    const language = block.language || '';
    return `\`\`\`${language}\n${block.text || ''}\n\`\`\``;
  }

  if (block.kind === 'plain_text') {
    return `\`\`\`text\n${block.text || ''}\n\`\`\``;
  }

  return block.text || '';
}

export function renderConversationAsMarkdown(conversation, options = {}) {
  const output = [];

  if (options.title) output.push(`# ${options.title}`);
  if (options.sourceUrl) output.push(`Source: ${options.sourceUrl}`);

  conversation.messages.forEach((message) => {
    output.push(`## ${normalizeRoleHeading(message.role)}`);

    const contentBlocks = buildMessageContentBlocks(message.parts);
    contentBlocks.forEach((block) => {
      output.push(renderBlock(block));
    });
  });

  return output.join('\n\n').trim();
}
