import type { App } from '../app.ts';
import { audio } from '../audio/audio.ts';
import { LINE, SPECIES } from '../data/pokedex.ts';
import { STAGE, STAGES } from '../data/stages.ts';
import { stageUnlocked } from '../meta/achievements.ts';
import { ClientSession, NetClient, NetHost, type LobbyPlayer } from '../net/net.ts';
import { assets } from '../render/assets.ts';
import { btn, h, img, toast, typeBadge } from './dom.ts';
import { selectScreen } from './menus.ts';

const screen = (...children: (Node | null)[]) => h('div', { class: 'screen dim' }, ...children);

export function lobbyMenu(app: App) {
  const code = h('input', { type: 'text', maxlength: 5, placeholder: 'CODE', style: 'text-transform:uppercase;font-family:var(--head);font-size:18px;letter-spacing:4px;text-align:center' });
  const status = h('div', { class: 'hint center mt' });
  const join = async () => {
    const c = code.value.trim().toUpperCase();
    if (c.length !== 5) { audio.sfx('error'); status.textContent = 'Enter the 5-character room code.'; return; }
    app.show(selectScreen(app, (line) => void joinGame(app, c, line), 'Choose your partner', () => app.show(lobbyMenu(app))));
  };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') void join(); });
  return screen(
    h('div', { class: 'topbar', style: 'width:min(640px,100%)' }, btn('◀ Back', () => app.goTitle(), 'small', { 'data-back': true }), h('h2', null, 'Online Co-op')),
    h('div', { class: 'panel lobby col', style: 'width:min(640px,100%)' },
      h('p', null, 'Team up with up to 3 friends over the internet. One player hosts and shares a room code. Shared Exp. — everyone levels up together and picks their own upgrades. Fainted teammates can be revived by standing next to them.'),
      btn('Host a game', () => app.show(selectScreen(app, (line) => void hostGame(app, line), 'Choose your partner', () => app.show(lobbyMenu(app)))), 'primary', { 'data-autofocus': true }),
      h('div', { class: 'row mt' }, code, btn('Join', () => void join())),
      status,
      h('p', { class: 'hint' }, 'Connections are peer-to-peer (WebRTC) using the free PeerJS matchmaking server. Each player earns Poké Dollars and achievements on their own save.'),
    ),
  );
}

function playerCards(players: LobbyPlayer[]) {
  return h('div', { class: 'lobby-players' }, players.map((p) => {
    const line = LINE[p.lineId];
    const sp = SPECIES[line.stages[0]];
    return h('div', { class: 'lobby-player' },
      img(assets.portraitUrl(sp.id, p.shiny)),
      h('div', { class: 'nm' }, p.ready ? p.name : 'Connecting…'),
      h('div', { class: 'hint' }, line.name),
      h('div', null, sp.types.map(typeBadge)),
    );
  }));
}

async function hostGame(app: App, lineId: string) {
  app.endRun();
  const host = new NetHost(app.playerInit(lineId));
  app.net = host;
  host.stage = stageUnlocked(app.save, app.save.lastStage) ? app.save.lastStage : 'viridian';
  const wrap = screen(h('h2', null, 'Opening room…'));
  app.show(wrap);
  try {
    await host.open();
  } catch (e) {
    toast('Could not host', (e as Error).message);
    app.net = null;
    app.show(lobbyMenu(app));
    return;
  }
  host.onError = (m) => toast('Network', m);
  const render = () => {
    if (!wrap.isConnected) return;
    const players = host.lobbyPlayers();
    const open = STAGES.filter((s) => stageUnlocked(app.save, s.id));
    const idx = Math.max(0, open.findIndex((s) => s.id === host.stage));
    const st = STAGE[host.stage];
    wrap.innerHTML = '';
    wrap.append(
      h('div', { class: 'topbar', style: 'width:min(760px,100%)' }, btn('◀ Leave', () => { app.endRun(); app.show(lobbyMenu(app)); }, 'small', { 'data-back': true }), h('h2', null, 'Hosting')),
      h('div', { class: 'panel lobby col' },
        h('div', { class: 'center hint' }, 'Share this room code with your friends:'),
        h('div', { class: 'code' }, host.code),
        btn('Copy code', () => { void navigator.clipboard?.writeText(host.code); toast('Copied', host.code); }, 'small'),
        playerCards(players),
        h('div', { class: 'row', style: 'flex-wrap:wrap' },
          btn('◀', () => { host.stage = open[(idx - 1 + open.length) % open.length].id; host.broadcastLobby(); render(); }, 'small'),
          h('div', { style: 'flex:1;text-align:center' }, h('b', null, st.name), h('div', null, st.types.map(typeBadge))),
          btn('▶', () => { host.stage = open[(idx + 1) % open.length].id; host.broadcastLobby(); render(); }, 'small'),
        ),
        h('div', { class: 'row', style: 'flex-wrap:wrap' },
          btn('Change Pokémon', () => app.show(selectScreen(app, (l) => { host.lobbyInit = app.playerInit(l); host.broadcastLobby(); app.show(wrap); render(); }, 'Choose your partner', () => { app.show(wrap); render(); }))),
          h('span', { class: 'spacer' }),
          btn(players.length > 1 ? `Start (${players.length} players)` : 'Start (waiting for friends…)', async () => {
            if (players.some((p) => !p.ready)) { toast('Hold on', 'A player is still connecting.'); return; }
            const session = host.start();
            await app.preload(session);
            app.beginSession(session);
          }, 'primary', { 'data-autofocus': true }),
        ),
      ),
    );
  };
  host.onLobby = render;
  render();
}

async function joinGame(app: App, code: string, lineId: string) {
  app.endRun();
  const client = new NetClient();
  app.net = client;
  const wrap = screen(h('h2', null, `Joining ${code}…`));
  app.show(wrap);
  let init = app.playerInit(lineId);
  try {
    await client.join(code, init);
  } catch (e) {
    toast('Could not join', (e as Error).message);
    app.net = null;
    app.show(lobbyMenu(app));
    return;
  }
  client.onError = (m) => {
    toast('Disconnected', m);
    if (!app.session) { app.endRun(); app.show(lobbyMenu(app)); }
  };
  const render = () => {
    if (!wrap.isConnected) return;
    const st = STAGE[client.stage];
    wrap.innerHTML = '';
    wrap.append(
      h('div', { class: 'topbar', style: 'width:min(760px,100%)' }, btn('◀ Leave', () => { app.endRun(); app.show(lobbyMenu(app)); }, 'small', { 'data-back': true }), h('h2', null, `Room ${code}`)),
      h('div', { class: 'panel lobby col' },
        playerCards(client.lobby),
        h('div', { class: 'center' }, 'Route: ', h('b', null, st?.name ?? '?'), ' ', ...(st?.types.map(typeBadge) ?? [])),
        h('div', { class: 'row' },
          btn('Change Pokémon', () => app.show(selectScreen(app, (l) => { init = app.playerInit(l); client.send({ t: 'pick', init }); app.show(wrap); render(); }, 'Choose your partner', () => { app.show(wrap); render(); })), '', { 'data-autofocus': true }),
          h('span', { class: 'spacer' }),
          h('div', { class: 'hint' }, 'Waiting for the host to start…'),
        ),
      ),
    );
  };
  client.onLobby = render;
  client.onStart = (cfg, you) => {
    const session = new ClientSession(cfg, you, client);
    void app.preload(session).then(() => app.beginSession(session));
  };
  render();
}
