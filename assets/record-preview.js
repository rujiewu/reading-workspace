/* Private navigation labels are excerpts, never new model calls or stored edits. */
window.HUB_RECORD_PREVIEW = (() => {
  const plain = value => String(value || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '').replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[`*_#]/g, '').replace(/\s+/g, ' ').trim();
  function clip(value, limit) {
    const chars = Array.from(value);
    return chars.length > limit ? chars.slice(0, limit).join('').replace(/[，,:：;；\s]+$/, '') + '…' : value;
  }
  function describe(text, latest = text, fallback = '新对话') {
    const original = plain(text), recent = plain(latest);
    const section = original.match(/^围绕《[^》]+》第\s*\d+\s*节「([^」]+)」讨论[。.]?/);
    const subject = (section ? section[1] : original)
      .replace(/^(?:请问[，,:：]?\s*|请(?:帮我|给我)?(?:详细)?(?:解释(?:一下)?|说明(?:一下)?|分析(?:一下)?|介绍(?:一下)?)?\s*|我想(?:了解|知道)[，,:：]?\s*)/, '')
      .replace(/[？?！!。].*$/, '').trim();
    const title = clip(subject || original || fallback, 24);
    let detail = recent;
    if (recent === original && title === subject) {
      const end = original.search(/[？?！!。]/);
      detail = end < 0 ? '' : original.slice(end + 1).trim();
    }
    const summary = detail && detail !== title ? clip(detail, 96) : '';
    return Object.freeze({ title, summary });
  }
  function conversation(record) {
    const users = (record.messages || []).filter(message => message.role === 'user' && message.content?.trim());
    const opening = record.preview?.opening || users[0]?.content;
    const latest = record.preview?.latest || users.at(-1)?.content || opening;
    return describe(opening, latest, '新对话');
  }
  return Object.freeze({ describe, conversation });
})();
