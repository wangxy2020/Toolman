/**
 * Answer a browser `device-sync` offer with Chromium's RTCPeerConnection.
 * The native stack only speaks encrypted `events` / `files` channels, and it
 * withholds the answer SDP until ICE connects — the browser never sees it.
 */
import { BrowserWindow } from 'electron'
import type { SyncChange } from '@toolman/shared'

export type PersonalSyncRtcIceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function answerExpression(payload: string): string {
  return `(() => {
    const input = ${payload};
    const pc = new RTCPeerConnection({ iceServers: input.iceServers || [] });
    const bag = { inbound: [], sent: false, pc };
    globalThis.__toolmanPersonalSync = bag;
    const sendChanges = () => {
      const channel = bag.channel;
      if (!channel || channel.readyState !== 'open' || bag.sent) return;
      channel.send(JSON.stringify({
        type: 'sync.changes',
        senderDeviceId: input.localDeviceId,
        changes: input.changes || [],
      }));
      bag.sent = true;
      bag.sentAt = Date.now();
    };
    pc.ondatachannel = (event) => {
      bag.channel = event.channel;
      event.channel.onmessage = (message) => {
        const text = typeof message.data === 'string' ? message.data : '';
        if (text) bag.inbound.push(text);
        sendChanges();
      };
    };
    const waitIce = () => new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      const timer = setTimeout(resolve, 7000);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    return pc.setRemoteDescription({ type: 'offer', sdp: input.offerSdp })
      .then(() => pc.createAnswer())
      .then((answer) => pc.setLocalDescription(answer))
      .then(() => waitIce())
      .then(() => {
        const sdp = pc.localDescription && pc.localDescription.sdp;
        if (!sdp) throw new Error('empty answer');
        return sdp;
      });
  })()`
}

function collectExpression(): string {
  return `(() => new Promise((resolve) => {
    const bag = globalThis.__toolmanPersonalSync;
    if (!bag) { resolve([]); return; }
    const started = Date.now();
    const timer = setInterval(() => {
      const texts = bag.inbound.slice();
      const sawPeer = texts.some((text) => text.indexOf('"sync.pull"') >= 0 || text.indexOf('"sync.changes"') >= 0);
      const flushed = bag.channel && bag.channel.bufferedAmount === 0 && bag.sentAt && Date.now() - bag.sentAt > 750;
      if ((sawPeer && bag.sent && flushed) || Date.now() - started > 18000) {
        clearInterval(timer);
        resolve(texts);
      }
    }, 250);
  }))()`
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

/**
 * Returns inbound data-channel texts. `onAnswer` runs as soon as the answer
 * SDP is gathered, before the channel exchange finishes.
 */
export async function answerPersonalSyncOffer(input: {
  offerSdp: string
  iceServers: PersonalSyncRtcIceServer[]
  localDeviceId: string
  changes: SyncChange[]
  onAnswer: (answerSdp: string) => Promise<void>
}): Promise<string[]> {
  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  try {
    await win.loadURL('about:blank')
    const answerSdp = await withTimeout(
      win.webContents.executeJavaScript(
        answerExpression(
          embedJson({
            offerSdp: input.offerSdp,
            iceServers: input.iceServers,
            localDeviceId: input.localDeviceId,
            changes: input.changes,
          }),
        ),
      ) as Promise<unknown>,
      15_000,
      'browser answer timed out',
    )
    if (typeof answerSdp !== 'string' || !answerSdp.includes('v=0')) {
      throw new Error('browser answer SDP missing')
    }
    await input.onAnswer(answerSdp)
    const inbound = await withTimeout(
      win.webContents.executeJavaScript(collectExpression()) as Promise<unknown>,
      20_000,
      'browser sync exchange timed out',
    )
    return Array.isArray(inbound) ? inbound.filter((item): item is string => typeof item === 'string') : []
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
