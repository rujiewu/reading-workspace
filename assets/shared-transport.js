/* Public materials stay static; only the shared gateway handles private state. */
window.HUB_SHARED_TRANSPORT = (config, dependencies = {}) => {
  const fetcher = dependencies.fetch || window.fetch.bind(window);
  const storage = dependencies.storage || (() => window.sessionStorage);
  const local = dependencies.localStorage || (() => window.localStorage);
  const clock = dependencies.now || (() => Date.now());
  const modules = new Set(['reading', 'learning', 'trading', 'investment']);
  const base = String(config.base || '').replace(/\/$/, '');
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  const tokenKey = `hub-shared-session:${apiBase || 'unconfigured'}`;
  const cache = new Map();
  const pendingQuestions = new Map();
  const changedSections = new Map();
  let session = null, sessionRevision = 0;
  let navigation = null, navigationDirty = false, navigationTimer, navigationRevision = 0;
  let navigationWrite = null;
  const identity = value => typeof value === 'string' && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value);
  const uuid = () => crypto.randomUUID().replaceAll('-', '');
  const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' },
  });

  function validSession(value) {
    return value && typeof value.token === 'string' && value.token.length > 0
      && value.token.length <= 8192 && Number.isFinite(Date.parse(value.expires_at))
      && Date.parse(value.expires_at) > clock();
  }

  function forgetSession() {
    sessionRevision += 1;
    session = null;
    cache.clear();
    navigation = null;
    navigationDirty = false;
    changedSections.clear();
    clearTimeout(navigationTimer);
    try { storage().removeItem(tokenKey); } catch { /* Memory is already cleared. */ }
  }

  try {
    const saved = storage().getItem(tokenKey);
    if (saved) {
      const value = JSON.parse(saved);
      if (validSession(value)) session = value;
      else forgetSession();
    }
  } catch { /* An unavailable store requires login in this tab. */ }

  function gatewayURL(path) {
    if (!apiBase) throw new Error('共享服务尚未配置，可以稍后再试。');
    const origin = new URL(apiBase);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if (origin.username || origin.password || origin.search || origin.hash
        || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && loopback))) {
      throw new Error('共享服务地址无效。');
    }
    if (!path.startsWith('/api/')) throw new Error('未知共享操作。');
    return `${apiBase}${path}`;
  }

  async function gateway(path, method = 'GET', body, unauthenticated = false) {
    const target = gatewayURL(path);
    if (!unauthenticated && !validSession(session)) {
      forgetSession();
      return json({ detail: '请重新输入访问口令。' }, 401);
    }
    const revision = sessionRevision;
    const timeoutMs = path === '/api/login' ? 12000 : path.startsWith('/api/chat') ? 240000 : 60000;
    const controller = new AbortController();
    let timer, expired = false;
    const timeoutMessage = path === '/api/login'
      ? '连接验证服务超时，请检查网络后重试。'
      : '连接学习服务超时，请检查网络后重试。';
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        controller.abort();
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([deadline, (async () => {
        const reply = await fetcher(target, {
          method, credentials: 'omit', cache: 'no-store',
          headers: {
            Accept: 'application/json',
            ...(!unauthenticated && session ? { Authorization: `Bearer ${session.token}` } : {}),
            ...(body !== undefined ? { 'Content-Type': 'application/json', 'X-Hub-Request': '1' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });
        // Cover a stalled response body as well as the connection, preserving
        // the original response for the existing JSON/version checks.
        await reply.clone().arrayBuffer();
        return reply;
      })()]);
      if (!unauthenticated && revision !== sessionRevision) throw new Error('会话已更新，请重试当前操作。');
      if (response.status === 401 && !unauthenticated) forgetSession();
      return response;
    } catch (error) {
      if (expired) throw new Error(timeoutMessage);
      if (error instanceof TypeError) throw new Error('无法连接学习服务，请检查网络后重试。');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function capture(response, key) {
    if (response.ok) {
      const data = await response.clone().json();
      if (!Object.prototype.hasOwnProperty.call(data, 'sha')) {
        throw new Error('共享记录缺少版本信息，暂时不能覆盖保存。');
      }
      cache.set(key, data.sha);
    }
    return response;
  }

  async function staticJSON(path) {
    const response = await fetcher(`${base}/${path}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('学习资料暂时无法读取，请刷新后重试。');
    return response.json();
  }

  function noteKey(module, resource) { return `note:${module}:${resource}`; }
  function sessionKey(module, id) { return `session:${module}:${id}`; }
  function preferencesKey(module) { return `preferences:${module}`; }

  function expectedSHA(key) {
    if (!cache.has(key)) throw new Error('请先成功读取记录，再保存修改。');
    return cache.get(key);
  }

  async function restoreNavigation() {
    // A concurrent browser update must not replace a locally pending position.
    if (navigationDirty) return;
    const response = await gateway(`/api/preferences?module=${encodeURIComponent(config.module)}`);
    if (!response.ok) throw new Error('阅读位置暂时无法同步。');
    await capture(response, preferencesKey(config.module));
    const record = await response.json();
    if (!record.sections || typeof record.sections !== 'object' || Array.isArray(record.sections)) {
      throw new Error('阅读位置记录格式无效。');
    }
    navigation = { last_resource_id: record.last_resource_id || null, sections: { ...record.sections } };
    try {
      const lastKey = `hub-last-material-v1:${config.module}`;
      if (identity(navigation.last_resource_id)) local().setItem(lastKey, navigation.last_resource_id);
      else local().removeItem(lastKey);
      const sectionPrefix = `hub-section-v1:${config.module}:`;
      const stale = [];
      for (let index = 0; index < local().length; index++) {
        const key = local().key(index);
        if (key?.startsWith(sectionPrefix)) stale.push(key);
      }
      stale.forEach(key => local().removeItem(key));
      for (const [resource, section] of Object.entries(navigation.sections)) {
        if (identity(resource) && typeof section === 'string' && section.length <= 500) {
          local().setItem(`${sectionPrefix}${resource}`, section);
        }
      }
    } catch { /* Reading remains available without optional browser preferences. */ }
  }

  async function flushNavigation() {
    clearTimeout(navigationTimer);
    if (navigationWrite) return navigationWrite;
    if (!navigationDirty || !navigation) return;
    const revision = navigationRevision;
    const snapshot = { module: config.module, last_resource_id: navigation.last_resource_id,
      sections: { ...navigation.sections }, expected_sha: expectedSHA(preferencesKey(config.module)) };
    const edits = new Map(changedSections);
    navigationWrite = (async () => {
      let written = snapshot;
      let response = await gateway('/api/preferences', 'PUT', written);
      if (response.status === 409) {
        // Positions are navigation metadata. Preserve the other visitor's
        // untouched sections while merging only this browser's recent moves.
        const latestResponse = await gateway(`/api/preferences?module=${encodeURIComponent(config.module)}`);
        if (!latestResponse.ok) throw new Error('阅读位置暂未同步。');
        await capture(latestResponse, preferencesKey(config.module));
        const latest = await latestResponse.json();
        if (!latest.sections || typeof latest.sections !== 'object' || Array.isArray(latest.sections)) {
          throw new Error('阅读位置记录格式无效。');
        }
        const merged = { ...latest.sections };
        for (const [resource, edit] of edits) merged[resource] = edit.section;
        written = { ...snapshot, sections: merged, expected_sha: latest.sha };
        response = await gateway('/api/preferences', 'PUT', written);
      }
      if (!response.ok) throw new Error(response.status === 409
        ? '阅读位置在别处更新；当前浏览器保留你的位置。' : '阅读位置暂未同步。');
      await capture(response, preferencesKey(config.module));
      const newer = [...changedSections].filter(([, edit]) => edit.revision > revision);
      navigation.sections = { ...written.sections };
      for (const [resource, edit] of newer) navigation.sections[resource] = edit.section;
      for (const [resource, edit] of changedSections) {
        if (edit.revision <= revision) changedSections.delete(resource);
      }
      if (revision === navigationRevision) navigationDirty = false;
    })();
    try { await navigationWrite; }
    finally {
      navigationWrite = null;
      if (navigationDirty && revision !== navigationRevision) scheduleNavigation();
    }
  }

  function scheduleNavigation() {
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(() => flushNavigation().catch(() => {
      const status = document.getElementById('resume-status');
      if (status) { status.hidden = false; status.textContent = '位置暂未同步'; }
    }), 20000);
  }

  function rememberNavigation(module, resource, section) {
    if (!navigation || module !== config.module || !identity(resource)) return;
    navigation.last_resource_id = resource;
    navigationDirty = true;
    navigationRevision++;
    if (typeof section === 'string' && section.length <= 500) {
      navigation.sections[resource] = section;
      changedSections.set(resource, { section, revision: navigationRevision });
    }
    scheduleNavigation();
  }

  async function handle(path, options = {}) {
    const url = new URL(path, 'https://workspace.invalid');
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : undefined;
    const module = url.searchParams.get('module') || body?.module || config.module;
    if (!modules.has(module)) return json({ detail: '未知模块。' }, 422);
    if (url.pathname === '/api/me') {
      if (!validSession(session)) { forgetSession(); return json({ authenticated: false, password_required: true }); }
      return gateway('/api/me');
    }
    if (url.pathname === '/api/login') {
      forgetSession();
      const revision = sessionRevision;
      const response = await gateway('/api/login', 'POST', { password: body?.password }, true);
      if (!response.ok) return response;
      const connected = await response.clone().json();
      // The gateway returns Unix seconds; current-tab storage uses an ISO date.
      const deadline = new Date(typeof connected.expires_at === 'number' && Number.isSafeInteger(connected.expires_at)
        ? connected.expires_at * 1000 : typeof connected.expires_at === 'string' ? connected.expires_at : NaN);
      const authenticatedSession = { token: connected.token,
        expires_at: Number.isFinite(deadline.getTime()) ? deadline.toISOString() : '' };
      if (revision !== sessionRevision) throw new Error('登录请求已取消，请重试。');
      if (!connected.authenticated || !validSession(authenticatedSession)) throw new Error('登录未完成，请重新输入口令。');
      session = authenticatedSession;
      try { storage().setItem(tokenKey, JSON.stringify(session)); } catch { /* Current-tab memory login remains valid. */ }
      return response;
    }
    if (url.pathname === '/api/logout') {
      const revision = sessionRevision;
      let response;
      try { response = validSession(session) ? await gateway('/api/logout', 'POST', {}) : json({ ok: true }); }
      catch (error) {
        if (revision !== sessionRevision) throw error;
        response = json({ ok: true });
      }
      finally { if (revision === sessionRevision) forgetSession(); }
      return response;
    }
    if (!validSession(session)) { forgetSession(); return json({ detail: '请重新输入访问口令。' }, 401); }
    if (url.pathname === '/api/catalog') return json(await staticJSON(`data/catalog-${module}.json`));
    const study = url.pathname.match(/^\/api\/reading\/([a-z0-9_-]+)\/study$/);
    if (study) return json(await staticJSON(`data/books/${study[1]}.json`));
    if (url.pathname === '/api/notes') {
      const resource = url.searchParams.get('resource_id') || body?.resource_id;
      if (!identity(resource)) return json({ detail: '无效材料。' }, 422);
      const key = noteKey(module, resource);
      if (method === 'GET') {
        const response = await gateway(url.pathname + url.search);
        return options.preserveVersion ? response : capture(response, key);
      }
      const response = await capture(await gateway('/api/notes', 'PUT', {
        ...body, module, resource_id: resource, expected_sha: expectedSHA(key),
      }), key);
      if (response.ok) await flushNavigation().catch(() => { /* Notes are saved; navigation remains local. */ });
      return response;
    }
    if (url.pathname === '/api/sessions') {
      if (method === 'GET') return gateway(`/api/sessions?module=${encodeURIComponent(module)}`);
      const response = await gateway('/api/sessions', 'POST', { ...body, module });
      if (response.ok) {
        const created = await response.clone().json();
        await capture(response, sessionKey(module, created.id));
      }
      return response;
    }
    const conversation = url.pathname.match(/^\/api\/sessions\/([a-f0-9]{32})$/);
    if (conversation) return capture(await gateway(`${url.pathname}?module=${encodeURIComponent(module)}`), sessionKey(module, conversation[1]));
    if (url.pathname === '/api/chat') {
      const key = sessionKey(module, body?.session_id);
      if (!cache.has(key)) {
        const latest = await gateway(`/api/sessions/${body.session_id}?module=${encodeURIComponent(module)}`);
        if (!latest.ok) return latest;
        await capture(latest, key);
      }
      const questionKey = JSON.stringify([module, body?.session_id, body?.message]);
      let requestId = pendingQuestions.get(questionKey);
      if (!requestId) { requestId = uuid(); pendingQuestions.set(questionKey, requestId); }
      const response = await gateway('/api/chat', 'POST', {
        ...body, module, request_id: requestId, expected_sha: expectedSHA(key),
      });
      if (!response.ok) {
        const failure = await response.clone().json().catch(() => null);
        if (failure?.request_status === 'FAILED' && failure.retry_after_configuration === true) {
          // A provider explicitly refused generation. Only a later user click
          // creates a new attempt; ambiguous requests retain their original ID.
          pendingQuestions.delete(questionKey);
          cache.delete(key);
        }
      }
      if (response.ok) {
        const result = await response.clone().json();
        if (result.status !== 'COMPLETED' || typeof result.reply !== 'string' || !result.reply.trim()) {
          throw new Error('本次请求没有得到完整回复，问题已保留。');
        }
        pendingQuestions.delete(questionKey);
        // History changed on the server. Refresh it before a later chat write.
        cache.delete(key);
        try {
          const latest = await gateway(`/api/sessions/${body.session_id}?module=${encodeURIComponent(module)}`);
          if (latest.ok) await capture(latest, key);
        } catch { /* A saved reply remains completed; read again before the next question. */ }
      }
      return response;
    }
    return json({ detail: '此部署没有这项操作。' }, 404);
  }

  function acceptNoteSnapshot(module, resource, record) {
    if (!modules.has(module) || !identity(resource) || !record
        || !Object.prototype.hasOwnProperty.call(record, 'sha')) {
      throw new Error('共享记录缺少版本信息，暂时不能覆盖保存。');
    }
    cache.set(noteKey(module, resource), record.sha);
  }

  return Object.freeze({ kind: 'shared', restoreNavigation, flushNavigation, rememberNavigation, acceptNoteSnapshot,
    request: handle });
};

const sharedHubConfig = window.HUB_SHARED_CONFIG
  || (window.HUB_GITHUB_CONFIG?.transport === 'shared' ? window.HUB_GITHUB_CONFIG : null);
if (sharedHubConfig) {
  window.HUB_REMOTE = window.HUB_SHARED_TRANSPORT(sharedHubConfig);
  document.addEventListener('DOMContentLoaded', () => {
    const label = document.querySelector('label[for=password]');
    if (label) label.textContent = '访问口令';
    const input = document.getElementById('password');
    if (input) { input.autocomplete = 'off'; input.placeholder = '输入访问口令'; }
    const copy = document.querySelector('.login-copy');
    if (copy) copy.textContent = '共用学习记录与对话。';
    const badge = document.querySelector('.private-badge');
    if (badge) badge.textContent = '共享保存';
  });
}
