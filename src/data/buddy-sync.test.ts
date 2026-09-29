/**
 * The handshake, from both ends.
 *
 * Everything here is a decision one phone makes about another with nothing to
 * go on but what arrived — a name, a status, a hello — and every bug in it is
 * silent: a connection that never happens, on two screens that both look as
 * though nothing was tried. The radio itself is a component and is not under
 * test; what it *decides* is pure (`judgeOffer`, `judgeRefusal`, `judgeHello`)
 * and is.
 *
 * The last block runs two phones against each other. The finding this was
 * built to close — two phones that disagree about the pairing secret cannot
 * recover, and neither is told — is a property of the pair, not of either
 * function, so it is tested as one: over every combination of who holds what,
 * no connection may end with one phone trusting and the other not, and none
 * may end with nobody told.
 */
import { describe, expect, it } from 'vitest';
import {
  authProof,
  decodePeerName,
  encodePeerName,
  endsPairing,
  enrolAck,
  enrolAckOk,
  type Hello,
  type HelloKind,
  judgeHello,
  judgeOffer,
  judgeRefusal,
  mendsByPairing,
  type PairingIssue,
  parseBuddyMessage,
  PROTOCOL_VERSION,
  versionGap,
} from './buddy-sync';

const ID = 'a1b2c3d4e5f6';
const SECRET = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';
const DIGITS = '4821';

const wire = (m: object) => JSON.stringify({ v: 1, ...m });
const hello = (m: Partial<Hello> = {}): Hello => ({ v: 1, t: 'hello', name: 'Jonas', ...m });

/* ── the name a connection travels under ───────────────────────────────── */

describe('peer names', () => {
  it('round-trips an identity, unmarked', () => {
    expect(decodePeerName(encodePeerName(ID, 'Jonas'))).toEqual({
      id: ID, name: 'Jonas', pairing: false,
    });
  });

  it('round-trips the pairing mark without touching the id or the name', () => {
    expect(decodePeerName(encodePeerName(ID, 'Jonas', true))).toEqual({
      id: ID, name: 'Jonas', pairing: true,
    });
  });

  it('leaves the advertised form exactly as it was before the mark existed', () => {
    // An older build matches the roster off this string; a reconnect must
    // still look to it like the buddy it paired with.
    expect(encodePeerName(ID, 'Jonas')).toBe(`${ID}|Jonas`);
    expect(encodePeerName('', 'Jonas')).toBe('Jonas');
  });

  it('keeps a bar inside a display name', () => {
    expect(decodePeerName(encodePeerName(ID, 'Jo|nas', true))).toEqual({
      id: ID, name: 'Jo|nas', pairing: true,
    });
  });

  it('carries the mark for a phone with no id to advertise', () => {
    expect(decodePeerName(encodePeerName('', 'Jonas', true))).toEqual({
      id: null, name: 'Jonas', pairing: true,
    });
  });

  it('reads a bare name as id-less and unmarked', () => {
    expect(decodePeerName('Jonas')).toEqual({ id: null, name: 'Jonas', pairing: false });
  });

  it('does not take a plus in somebody’s name for the mark', () => {
    // Not an id in front of the bar, so the whole string is the name.
    expect(decodePeerName('C++|Anna')).toEqual({ id: null, name: 'C++|Anna', pairing: false });
    expect(decodePeerName('Anna+')).toEqual({ id: null, name: 'Anna+', pairing: false });
  });
});

/* ── version ───────────────────────────────────────────────────────────── */

describe('versionGap', () => {
  it('reads an absent version as the oldest build', () => {
    expect(versionGap(undefined)).toBe('older');
  });

  it('tells older from same from newer', () => {
    expect(versionGap(PROTOCOL_VERSION - 1)).toBe('older');
    expect(versionGap(PROTOCOL_VERSION)).toBe('same');
    expect(versionGap(PROTOCOL_VERSION + 1)).toBe('newer');
  });
});

/* ── parsing a hello ───────────────────────────────────────────────────── */

describe('parseBuddyMessage — hello', () => {
  it('keeps every field the handshake reads', () => {
    const m = parseBuddyMessage(
      wire({ t: 'hello', name: 'Jonas', id: ID, pv: 2, kind: 'proof', proof: 'abc' })
    );
    expect(m).toEqual({ v: 1, t: 'hello', name: 'Jonas', id: ID, pv: 2, kind: 'proof', proof: 'abc' });
  });

  it('keeps the minted secret on a pairing hello', () => {
    const m = parseBuddyMessage(wire({ t: 'hello', name: 'Jonas', pv: 2, kind: 'pair', newToken: SECRET }));
    expect(m).toMatchObject({ kind: 'pair', newToken: SECRET });
  });

  it('parses a hello from a build that predates the version and the kind', () => {
    // It has to *parse* — that is what lets the radio say "needs the newer
    // Spotter" instead of dropping the message and waiting out a deadline.
    const m = parseBuddyMessage(wire({ t: 'hello', name: 'Jonas', id: ID, proof: 'abc' }));
    expect(m).toEqual({ v: 1, t: 'hello', name: 'Jonas', id: ID, proof: 'abc' });
    expect(m && 'pv' in m).toBe(false);
    expect(m && 'kind' in m).toBe(false);
  });

  it.each([
    ['a string', '2'],
    ['a fraction', 2.5],
    ['zero', 0],
    ['negative', -1],
    ['absurd', 1e12],
    ['infinite', '1e999'],
    ['null', null],
  ])('drops a version that is %s', (_, pv) => {
    const raw = `{"v":1,"t":"hello","name":"Jonas","pv":${pv === '1e999' ? '1e999' : JSON.stringify(pv)}}`;
    const m = parseBuddyMessage(raw);
    expect(m).not.toBeNull();
    expect(m && 'pv' in m).toBe(false);
  });

  it('drops a kind it does not know', () => {
    const m = parseBuddyMessage(wire({ t: 'hello', name: 'Jonas', pv: 2, kind: 'trustme' }));
    expect(m && 'kind' in m).toBe(false);
  });

  it('drops fields nobody named', () => {
    const m = parseBuddyMessage(wire({ t: 'hello', name: 'Jonas', pv: 2, authed: true }));
    expect(m).toEqual({ v: 1, t: 'hello', name: 'Jonas', pv: 2 });
  });

  it('still needs a name', () => {
    expect(parseBuddyMessage(wire({ t: 'hello', pv: 2, kind: 'proof' }))).toBeNull();
  });

  it('leaves the envelope alone: `v` is still 1 and is still required', () => {
    // `pv` versions the handshake; `v` is the envelope and has not moved.
    expect(parseBuddyMessage(JSON.stringify({ t: 'hello', name: 'Jonas', pv: 2 }))).toBeNull();
    expect(parseBuddyMessage(JSON.stringify({ v: 2, t: 'hello', name: 'Jonas', pv: 2 }))).toBeNull();
    expect(parseBuddyMessage(wire({ t: 'bye' }))).toEqual({ v: 1, t: 'bye' });
  });
});

describe('parseBuddyMessage — the acknowledgement', () => {
  it('rides on the adopter’s hello', () => {
    const m = parseBuddyMessage(wire({ t: 'hello', name: 'Jonas', pv: 2, kind: 'pair', ack: 'abc' }));
    expect(m).toEqual({ v: 1, t: 'hello', name: 'Jonas', pv: 2, kind: 'pair', ack: 'abc' });
  });

  it('is dropped when it is not a string, and capped when it is an essay', () => {
    const odd = parseBuddyMessage(wire({ t: 'hello', name: 'Jonas', pv: 2, kind: 'pair', ack: 7 }));
    expect(odd && 'ack' in odd).toBe(false);
    const long = parseBuddyMessage(
      wire({ t: 'hello', name: 'Jonas', pv: 2, kind: 'pair', ack: 'x'.repeat(5000) })
    );
    expect(long && long.t === 'hello' && long.ack?.length).toBe(200);
  });

  it('is not a message of its own', () => {
    // Nothing but `hello` is honoured before trust, so there must be nothing
    // else for a handshake to be made of.
    expect(parseBuddyMessage(wire({ t: 'helloAck', proof: 'abc' }))).toBeNull();
  });
});

/* ── what to do with an offer ──────────────────────────────────────────── */

describe('judgeOffer', () => {
  const offer = (o: Partial<Parameters<typeof judgeOffer>[0]> = {}) =>
    judgeOffer({
      incoming: true, pairing: false, sharing: false, onRoster: false, haveSecret: false, ...o,
    });

  it('takes a pairing through the code even when a secret is held', () => {
    // The finding itself: a held secret used to skip the code stage the other
    // phone was busy showing.
    for (const incoming of [true, false])
      expect(
        offer({ incoming, pairing: true, sharing: true, onRoster: true, haveSecret: true })
      ).toEqual({ take: 'pair' });
  });

  it('proves a plain request in silence, with sharing open or closed', () => {
    for (const sharing of [true, false])
      for (const incoming of [true, false])
        expect(offer({ incoming, sharing, onRoster: true, haveSecret: true })).toEqual({
          take: 'proof',
        });
  });

  it('turns a pairing away when there is nowhere to show the code, and says so to the roster', () => {
    expect(offer({ pairing: true, onRoster: true, haveSecret: true })).toEqual({
      take: null, why: 'hailed',
    });
  });

  it('tells its user when a buddy on the roster knocks and cannot be checked', () => {
    expect(offer({ onRoster: true })).toEqual({ take: null, why: 'knocked' });
  });

  it('gives a stranger no line, whatever they ask for', () => {
    expect(offer({})).toEqual({ take: null, why: null });
    expect(offer({ pairing: true })).toEqual({ take: null, why: null });
  });

  it('drops its own request when it has nothing to prove it by, and says so', () => {
    // The reconnect ticker's request for a buddy whose secret is gone: left
    // alone it was re-made every five seconds for ever.
    expect(offer({ incoming: false, onRoster: true })).toEqual({ take: null, why: 'stale' });
    expect(offer({ incoming: false, sharing: true, onRoster: true })).toEqual({
      take: null, why: 'stale',
    });
  });

  it('takes an unmarked, unprovable request for a pairing while sharing is open', () => {
    // What a build from before the mark sends from its own share sheet.
    expect(offer({ sharing: true })).toEqual({ take: 'pair' });
    expect(offer({ sharing: true, onRoster: true })).toEqual({ take: 'pair' });
  });

  it('says nothing about a pairing of its own that it no longer has a sheet for', () => {
    // The user closed sharing between the tap and the offer. Their decision.
    expect(offer({ incoming: false, pairing: true, onRoster: true, haveSecret: true })).toEqual({
      take: null, why: null,
    });
  });
});

describe('judgeRefusal', () => {
  it('reads a pairing turned down as unconfirmed, from either side', () => {
    expect(judgeRefusal('pair', true)).toBe('unconfirmed');
    expect(judgeRefusal('pair', false)).toBe('unconfirmed');
  });

  it('reads a plain request turned down as the two phones having come apart', () => {
    expect(judgeRefusal('proof', false)).toBe('stale');
    expect(judgeRefusal('proof', true)).toBe('knocked');
  });
});

/* ── what to make of a hello ───────────────────────────────────────────── */

describe('judgeHello', () => {
  // An object, not a defaulted argument: `undefined` is a value under test
  // here, and a default would quietly swap the secret back in.
  const proving = (incoming: boolean, held: { secret?: string } = { secret: SECRET }) => ({
    kind: 'proof' as const, incoming, secret: held.secret, digits: DIGITS,
  });
  const pairing = (incoming: boolean, secret?: string) => ({
    kind: 'pair' as const, incoming, secret, digits: DIGITS,
    // The minting side minted OTHER on this connection; the adopter, nothing.
    ...(incoming ? {} : { minted: OTHER }),
  });
  const now = { pv: PROTOCOL_VERSION };

  it('judges the version before anything else', () => {
    // A perfectly good proof from an older build is still an older build —
    // and saying "out of date pairing" there would send both people off to
    // re-pair for nothing.
    const good = authProof(SECRET, DIGITS, 'initiator');
    expect(judgeHello(proving(true), hello({ kind: 'proof', proof: good }))).toEqual({
      ok: false, why: 'theyOld',
    });
    expect(
      judgeHello(proving(true), hello({ pv: PROTOCOL_VERSION + 1, kind: 'proof', proof: good }))
    ).toEqual({ ok: false, why: 'weOld' });
  });

  it('reads a pre-version pairing hello as an older build, not as a pairing', () => {
    expect(judgeHello(pairing(true), hello({ newToken: SECRET }))).toEqual({
      ok: false, why: 'theyOld',
    });
  });

  it('accepts a proof hashed under the peer’s direction', () => {
    // We accepted, so they requested: initiator.
    expect(
      judgeHello(proving(true), hello({ ...now, kind: 'proof', proof: authProof(SECRET, DIGITS, 'initiator') }))
    ).toEqual({ ok: true });
    expect(
      judgeHello(proving(false), hello({ ...now, kind: 'proof', proof: authProof(SECRET, DIGITS, 'responder') }))
    ).toEqual({ ok: true });
  });

  it('refuses our own proof reflected back', () => {
    const mine = authProof(SECRET, DIGITS, 'responder');
    expect(judgeHello(proving(true), hello({ ...now, kind: 'proof', proof: mine }))).toEqual({
      ok: false, why: 'stale',
    });
  });

  it('refuses a proof from another connection', () => {
    const replayed = authProof(SECRET, '0000', 'initiator');
    expect(judgeHello(proving(true), hello({ ...now, kind: 'proof', proof: replayed }))).toEqual({
      ok: false, why: 'stale',
    });
  });

  it.each([
    ['of another secret', authProof(OTHER, DIGITS, 'initiator')],
    ['missing', undefined],
    ['empty', ''],
  ])('refuses a proof that is %s', (_, proof) => {
    expect(judgeHello(proving(true), hello({ ...now, kind: 'proof', proof }))).toEqual({
      ok: false, why: 'stale',
    });
  });

  it('refuses every proof when this phone holds no secret', () => {
    const good = authProof(SECRET, DIGITS, 'initiator');
    expect(
      judgeHello(proving(true, {}), hello({ ...now, kind: 'proof', proof: good }))
    ).toEqual({ ok: false, why: 'stale' });
  });

  it('never acts on a hello of the other kind', () => {
    // A pairing hello does not get its token adopted by a phone that is
    // expecting a proof, however valid everything else about it is …
    expect(
      judgeHello(proving(true), hello({ ...now, kind: 'pair', newToken: OTHER }))
    ).toEqual({ ok: false, why: 'stale' });
    // … and a proof does not stand in for the code on a phone that showed one.
    expect(
      judgeHello(
        pairing(true, SECRET),
        hello({ ...now, kind: 'proof', proof: authProof(SECRET, DIGITS, 'initiator') })
      )
    ).toEqual({ ok: false, why: 'stale' });
    // The minting side has nothing of theirs to check, so the kind is the
    // only thing standing between it and trusting a link the other phone is
    // running as a reconnect.
    expect(
      judgeHello(
        pairing(false, SECRET),
        hello({ ...now, kind: 'proof', proof: authProof(SECRET, DIGITS, 'responder') })
      )
    ).toEqual({ ok: false, why: 'stale' });
    expect(judgeHello(proving(true), hello({ ...now }))).toEqual({ ok: false, why: 'stale' });
  });

  it('is not talked round by a hello that carries the right evidence under the wrong kind', () => {
    // Each of these would pass every check but the kind: the evidence is
    // real, and it is evidence for a handshake the sender says it isn't running.
    const stale = { ok: false, why: 'stale' };
    expect(
      judgeHello(
        proving(true),
        hello({ ...now, kind: 'pair', proof: authProof(SECRET, DIGITS, 'initiator') })
      )
    ).toEqual(stale);
    expect(
      judgeHello(pairing(true), hello({ ...now, kind: 'proof', newToken: OTHER }))
    ).toEqual(stale);
    expect(
      judgeHello(pairing(false), hello({ ...now, kind: 'proof', ack: enrolAck(OTHER, DIGITS) }))
    ).toEqual(stale);
  });

  it('adopts the minted secret on the side that accepted', () => {
    expect(judgeHello(pairing(true), hello({ ...now, kind: 'pair', newToken: OTHER }))).toEqual({
      ok: true, adopt: OTHER,
    });
  });

  it('adopts over a secret it already held', () => {
    expect(
      judgeHello(pairing(true, SECRET), hello({ ...now, kind: 'pair', newToken: OTHER }))
    ).toEqual({ ok: true, adopt: OTHER });
  });

  it('cannot finish a pairing whose minter sent no secret', () => {
    expect(judgeHello(pairing(true), hello({ ...now, kind: 'pair' }))).toEqual({
      ok: false, why: 'stale',
    });
    expect(judgeHello(pairing(true), hello({ ...now, kind: 'pair', newToken: '' }))).toEqual({
      ok: false, why: 'stale',
    });
  });

  it('lets the minter keep its secret only once it is acknowledged', () => {
    expect(
      judgeHello(pairing(false), hello({ ...now, kind: 'pair', ack: enrolAck(OTHER, DIGITS) }))
    ).toEqual({ ok: true });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['of another token', enrolAck(SECRET, DIGITS)],
    ['from another connection', enrolAck(OTHER, '0000')],
    ['the minter’s own lane echoed back', authProof(OTHER, DIGITS, 'initiator')],
  ])('refuses a pairing whose acknowledgement is %s', (_, ack) => {
    expect(judgeHello(pairing(false), hello({ ...now, kind: 'pair', ack }))).toEqual({
      ok: false, why: 'stale',
    });
  });

  it('adopts nothing on the side that minted', () => {
    // Exactly one minter. A token from the adopter's side is not a second one.
    expect(
      judgeHello(
        pairing(false),
        hello({ ...now, kind: 'pair', newToken: SECRET, ack: enrolAck(OTHER, DIGITS) })
      )
    ).toEqual({ ok: true });
  });
});

/* ── the enrolment's acknowledgement ───────────────────────────────────── */

describe('enrolAck', () => {
  it('confirms the secret that was minted, on the connection it was minted on', () => {
    expect(enrolAckOk(SECRET, enrolAck(SECRET, DIGITS), DIGITS)).toBe(true);
  });

  it('does not confirm another secret, or another connection', () => {
    expect(enrolAckOk(SECRET, enrolAck(OTHER, DIGITS), DIGITS)).toBe(false);
    expect(enrolAckOk(SECRET, enrolAck(SECRET, '0000'), DIGITS)).toBe(false);
  });

  it('confirms nothing when nothing was minted', () => {
    expect(enrolAckOk(undefined, enrolAck(SECRET, DIGITS), DIGITS)).toBe(false);
  });

  it('cannot be built from anything the minter itself hashes', () => {
    // The minter requested, so every proof it ever makes on this connection
    // is under the initiator's lane. An echo of one is not an acknowledgement.
    expect(enrolAckOk(SECRET, authProof(SECRET, DIGITS, 'initiator'), DIGITS)).toBe(false);
  });
});

/* ── which issues do what ──────────────────────────────────────────────── */

describe('pairing issues', () => {
  const ALL: PairingIssue[] = [
    'stale', 'knocked', 'hailed', 'unconfirmed', 'stalled', 'theyOld', 'weOld',
  ];

  it('ends a standing pairing only where trying again cannot help', () => {
    expect(ALL.filter(endsPairing)).toEqual(['stale', 'theyOld', 'weOld']);
  });

  it('offers the way into sharing only where a code would mend it', () => {
    expect(ALL.filter(mendsByPairing)).toEqual([
      'stale', 'knocked', 'hailed', 'unconfirmed', 'stalled',
    ]);
  });
});

/* ── two phones ────────────────────────────────────────────────────────── */

type Phone = { sharing: boolean; secret?: string; knows: boolean };

/** How one connection attempt ends on one phone. */
type End = 'trusted' | PairingIssue | 'silent';

/**
 * One connection attempt between two phones, run on the pure decisions alone
 * and in the order the radio runs them: both judge the offer; if either turns
 * it away the other hears a rejection; otherwise both say hello and each
 * judges the other's.
 */
const attempt = (asker: Phone, asked: Phone, request: HelloKind): { asker: End; asked: End } => {
  const a = judgeOffer({
    incoming: false, pairing: request === 'pair', sharing: asker.sharing,
    onRoster: asker.knows, haveSecret: asker.knows && asker.secret !== undefined,
  });
  const b = judgeOffer({
    incoming: true, pairing: request === 'pair', sharing: asked.sharing,
    onRoster: asked.knows, haveSecret: asked.knows && asked.secret !== undefined,
  });

  if (a.take === null || b.take === null) {
    const end = (mine: typeof a, incoming: boolean): End =>
      mine.take === null ? (mine.why ?? 'silent') : judgeRefusal(mine.take, incoming);
    return { asker: end(a, false), asked: end(b, true) };
  }

  // The asker speaks first, always: it is never the adopting side.
  const MINTED = 'aaaaaaaabbbbbbbbccccccccdddddddd';
  const first = hello({
    pv: PROTOCOL_VERSION,
    kind: a.take,
    ...(a.take === 'pair'
      ? { newToken: MINTED }
      : { proof: authProof(asker.secret ?? '', DIGITS, 'initiator') }),
  });
  const heard = judgeHello(
    { kind: b.take, incoming: true, secret: asked.secret, digits: DIGITS },
    first
  );
  // The asked phone answers — having heard the asker's if it is adopting, and
  // acknowledging only what it actually took.
  const answer = hello({
    pv: PROTOCOL_VERSION,
    kind: b.take,
    ...(b.take === 'pair'
      ? heard.ok && heard.adopt ? { ack: enrolAck(heard.adopt, DIGITS) } : {}
      : { proof: authProof(asked.secret ?? '', DIGITS, 'responder') }),
  });
  const back = judgeHello(
    {
      kind: a.take, incoming: false, secret: asker.secret, digits: DIGITS,
      ...(a.take === 'pair' ? { minted: MINTED } : {}),
    },
    answer
  );

  return {
    asker: back.ok ? 'trusted' : back.why,
    asked: heard.ok ? 'trusted' : heard.why,
  };
};

describe('two phones', () => {
  const holds: (string | undefined)[] = [undefined, SECRET, OTHER];
  const phones: Phone[] = [true, false].flatMap((sharing) =>
    [true, false].flatMap((knows) => holds.map((secret) => ({ sharing, knows, secret })))
  );
  const kinds: HelloKind[] = ['pair', 'proof'];
  const every = phones.flatMap((asker) =>
    phones.flatMap((asked) =>
      kinds
        // A pairing is only ever asked for from the share sheet.
        .filter((request) => request === 'proof' || asker.sharing)
        .map((request) => ({ asker, asked, request }))
    )
  );

  it('never leaves one phone trusting a link the other refused', () => {
    for (const c of every) {
      const end = attempt(c.asker, c.asked, c.request);
      expect([c, (end.asker === 'trusted') === (end.asked === 'trusted')]).toEqual([c, true]);
    }
  });

  it('never fails without the phone that asked being told', () => {
    for (const c of every) {
      const end = attempt(c.asker, c.asked, c.request);
      if (end.asker !== 'trusted') expect([c, end.asker]).not.toEqual([c, 'silent']);
    }
  });

  it('tells the phone that was asked, too, whenever it knows who was asking', () => {
    for (const c of every.filter((x) => x.asked.knows)) {
      const end = attempt(c.asker, c.asked, c.request);
      if (end.asked !== 'trusted') expect([c, end.asked]).not.toEqual([c, 'silent']);
    }
  });

  it('only ever trusts a plain request between two phones holding one secret', () => {
    for (const c of every.filter((x) => x.request === 'proof')) {
      const end = attempt(c.asker, c.asked, c.request);
      if (end.asker === 'trusted')
        expect([c, c.asker.secret !== undefined && c.asker.secret === c.asked.secret]).toEqual([
          c, true,
        ]);
    }
  });

  it('always pairs two phones that both have sharing open, whatever either held', () => {
    for (const c of every.filter((x) => x.request === 'pair' && x.asked.sharing))
      expect([c, attempt(c.asker, c.asked, c.request)]).toEqual([
        c, { asker: 'trusted', asked: 'trusted' },
      ]);
  });

  /* The audit's two cases, by name. A holds a secret for B; B holds none. */

  const A: Phone = { sharing: false, knows: true, secret: SECRET };

  it('B2, the ask: A is told the pairing is out of date instead of waiting for ever', () => {
    // B forgot A — no roster entry, so nothing on B's screen, as for any
    // stranger. A is the one who was left waiting, and A is told.
    const forgot: Phone = { sharing: false, knows: false };
    expect(attempt(A, forgot, 'proof')).toEqual({ asker: 'stale', asked: 'silent' });
    // B still lists A but lost the secret (a `newToken` that never arrived).
    const lost: Phone = { sharing: false, knows: true };
    expect(attempt(A, lost, 'proof')).toEqual({ asker: 'stale', asked: 'knocked' });
  });

  it('B2, the re-pair: both take the code, whichever of them taps', () => {
    const a = { ...A, sharing: true };
    const b: Phone = { sharing: true, knows: true };
    expect(attempt(b, a, 'pair')).toEqual({ asker: 'trusted', asked: 'trusted' });
    expect(attempt(a, b, 'pair')).toEqual({ asker: 'trusted', asked: 'trusted' });
  });

  it('B2, the leftover: B’s own reconnect is dropped and said, not looped', () => {
    const b: Phone = { sharing: false, knows: true };
    expect(attempt(b, A, 'proof').asker).toBe('stale');
  });

  it('two phones whose secrets differ are both told', () => {
    const b: Phone = { sharing: false, knows: true, secret: OTHER };
    expect(attempt(A, b, 'proof')).toEqual({ asker: 'stale', asked: 'stale' });
  });
});
