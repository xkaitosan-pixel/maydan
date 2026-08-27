import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const appBase = "http://127.0.0.1:4178/release-check/";
const playerId = "00000000-0000-4000-8000-000000000001";
const token = "test-capability-token-0000000000000000";
const HOST_LEASE_MS = 30_000;
const ROOM_RETENTION_MS = 60 * 60 * 1000;

type Row = Record<string, any>;

const questions = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  question: `E2E question ${index + 1}`,
  options: ["Alpha", "Beta", "Gamma", "Delta"],
  correct: index % 4,
  category: "general",
  difficulty: "easy",
  image_url: null,
}));

function shuffledCorrectIndex(question: (typeof questions)[number]) {
  let state = question.id | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const indexes = question.options.map((_, index) => index);
  for (let index = indexes.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes.indexOf(question.correct);
}

class MultiplayerBackend {
  rooms: Row[] = [];
  players: Row[] = [];
  queue: Row[] = [];
  matches: Row[] = [];
  partyAnswerCalls = 0;
  partySettlementCalls = 0;
  lastPartyCorrectAnswer: number | null = null;
  rankedAnswerWrites = { player1: 0, player2: 0 };
  deletedRooms = new Set<string>();
  nextMatch = 1;

  async install(context: BrowserContext) {
    await context.route("https://placeholder.supabase.co/**", (route) => this.handle(route));
  }

  seedParty(status: string, questionStart = Date.now()) {
    this.rooms = [{
      id: "room-1", code: "4242", status, category: "general",
      current_question: 0, total_questions: 1, answer_time: 5,
      show_question_on_phone: true, scoring_type: "speed",
      question_start_time: questionStart, total_players: 1,
      settled_question_index: -1, auto_advance_seconds: 0,
      host_token: token, host_last_seen_at: Date.now(), finished_at: null,
    }];
    this.players = [{
      id: playerId, room_code: "4242", nickname: "Guest",
      score: 0, answered_current: false, last_answer: null, answered_at: null,
      player_token: token,
    }];
  }

  expireHostLease() {
    const room = this.rooms[0];
    if (room) room.host_last_seen_at = Date.now() - HOST_LEASE_MS - 1;
  }

  expireRoomRetention() {
    const room = this.rooms[0];
    if (room) room.finished_at = Date.now() - ROOM_RETENTION_MS - 1;
  }

  private filters(url: URL, rows: Row[]) {
    let result = [...rows];
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      const decoded = decodeURIComponent(value);
      if (decoded.startsWith("eq.")) result = result.filter((row) => String(row[key]) === decoded.slice(3));
      if (decoded.startsWith("neq.")) result = result.filter((row) => String(row[key]) !== decoded.slice(4));
      if (decoded.startsWith("in.(")) {
        const values = decoded.slice(4, -1).split(",");
        result = result.filter((row) => values.includes(String(row[key])));
      }
    }
    const order = url.searchParams.get("order");
    if (order) {
      const [field, direction] = order.split(".");
      result.sort((a, b) => {
        const comparison = typeof a[field] === "number" && typeof b[field] === "number"
          ? a[field] - b[field]
          : String(a[field]).localeCompare(String(b[field]));
        return direction === "desc" ? -comparison : comparison;
      });
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? result.length);
    return result.slice(offset, offset + limit);
  }

  private async json(route: Route, body: unknown, headers: Record<string, string> = {}) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", ...headers },
      body: JSON.stringify(body),
    });
  }

  private table(name: string) {
    if (name === "questions") return questions;
    if (name === "party_rooms") return this.rooms;
    if (name === "party_players") return this.players;
    if (name === "ranked_queue") return this.queue;
    if (name === "ranked_matches") return this.matches;
    if (name === "users") return [];
    throw new Error(`Unhandled mocked table: ${name}`);
  }

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      return;
    }
    if (url.pathname.includes("/auth/v1/")) {
      await this.json(route, { user: null, session: null });
      return;
    }
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)/)?.[1];
    if (rpc) {
      await this.handleRpc(route, rpc, request.postDataJSON() ?? {});
      return;
    }
    const tableName = url.pathname.match(/\/rest\/v1\/([^/]+)/)?.[1];
    if (!tableName) throw new Error(`Unhandled mocked URL: ${url}`);
    const source = this.table(tableName);
    if (request.method() === "HEAD") {
      const count = this.filters(url, source).length;
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "content-range",
          "content-type": "application/json",
          "content-range": count ? `0-${count - 1}/${count}` : "*/0",
        },
      });
      return;
    }
    if (request.method() === "GET") {
      const rows = this.filters(url, source);
      const single = request.headers().accept?.includes("application/vnd.pgrst.object");
      await this.json(route, single ? (rows[0] ?? null) : rows, {
        "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0",
      });
      return;
    }
    const payload = request.postDataJSON() ?? {};
    if (request.method() === "POST") {
      const inserted = (Array.isArray(payload) ? payload : [payload]).map((row, index) => {
        if (tableName === "ranked_matches") {
          return { ...row, id: `match-${this.nextMatch++}`, created_at: new Date().toISOString() };
        }
        return { ...row, id: row.id ?? `${tableName}-${source.length + index + 1}`, created_at: new Date().toISOString() };
      });
      source.push(...inserted);
      const returnsRows = request.headers().prefer?.includes("return=representation");
      const single = request.headers().accept?.includes("application/vnd.pgrst.object");
      await this.json(route, returnsRows ? (single ? inserted[0] : inserted) : null);
      return;
    }
    if (request.method() === "PATCH") {
      const selected = this.filters(url, source);
      if (tableName === "ranked_matches") {
        if ("player1_answers" in payload) this.rankedAnswerWrites.player1++;
        if ("player2_answers" in payload) this.rankedAnswerWrites.player2++;
      }
      selected.forEach((row) => Object.assign(row, payload));
      const returnsRows = request.headers().prefer?.includes("return=representation");
      const single = request.headers().accept?.includes("application/vnd.pgrst.object");
      await this.json(route, returnsRows ? (single ? (selected[0] ?? null) : selected) : null);
      return;
    }
    throw new Error(`Unhandled ${request.method()} ${url}`);
  }

  private async handleRpc(route: Route, name: string, body: Row) {
    const room = this.rooms.find((item) => item.code === body.p_room_code);
    if (name === "resume_party_host") {
      await this.json(route, room?.host_token === body.p_host_token ? [{ ...room }] : null);
      return;
    }
    if (name === "resume_party_player") {
      await this.json(
        route,
        this.players.find((item) =>
          item.room_code === body.p_room_code &&
          item.id === body.p_player_id &&
          item.player_token === body.p_player_token
        ) ?? null,
      );
      return;
    }
    if (name === "maintain_party_room") {
      if (!room || this.deletedRooms.has(body.p_room_code)) {
        await this.json(route, "missing");
      } else if (
        (room.status === "finished" && (room.finished_at ?? room.host_last_seen_at) < Date.now() - ROOM_RETENTION_MS) ||
        (room.status !== "finished" && room.host_last_seen_at < Date.now() - ROOM_RETENTION_MS)
      ) {
        this.rooms = this.rooms.filter((item) => item.code !== body.p_room_code);
        this.players = this.players.filter((item) => item.room_code !== body.p_room_code);
        this.deletedRooms.add(body.p_room_code);
        await this.json(route, "deleted");
      } else if (room.status !== "finished" && room.host_last_seen_at < Date.now() - HOST_LEASE_MS) {
        room.status = "finished";
        room.finished_at = Date.now();
        await this.json(route, "finished");
      } else {
        await this.json(route, room.status === "finished" ? "finished" : "active");
      }
      return;
    }
    if (name === "heartbeat_party_host") {
      if (!room || room.host_token !== body.p_host_token) {
        await this.json(route, null);
      } else if (room.status !== "finished" && room.host_last_seen_at < Date.now() - HOST_LEASE_MS) {
        room.status = "finished";
        room.finished_at = Date.now();
        await this.json(route, "finished");
      } else {
        room.host_last_seen_at = Date.now();
        await this.json(route, room.status);
      }
      return;
    }
    if (name === "submit_party_answer") {
      this.partyAnswerCalls++;
      const player = this.players.find((item) =>
        item.id === body.p_player_id &&
        item.room_code === body.p_room_code &&
        item.player_token === body.p_player_token
      );
      if (
        !room ||
        !player ||
        room.status !== "question" ||
        room.current_question !== body.p_question_index ||
        player.answered_current ||
        Date.now() > room.question_start_time + room.answer_time * 1000
      ) {
        await this.json(route, { accepted: false });
        return;
      }
      player.answered_current = true;
      player.last_answer = body.p_answer;
      player.answered_at = Date.now();
      await this.json(route, { accepted: true, answered_at: player.answered_at });
      return;
    }
    if (name === "settle_party_question") {
      this.partySettlementCalls++;
      this.lastPartyCorrectAnswer = body.p_correct_answer;
      if (
        !room ||
        room.host_token !== body.p_host_token ||
        room.current_question !== body.p_question_index ||
        !["question", "reveal"].includes(room.status) ||
        body.p_correct_answer < 0 ||
        body.p_correct_answer > 3
      ) {
        await this.json(route, { settled: false });
        return;
      }
      if (room.settled_question_index >= body.p_question_index) {
        room.status = "reveal";
        await this.json(route, { settled: true });
        return;
      }
      for (const player of this.players) {
        const answeredInTime =
          player.answered_at >= room.question_start_time &&
          player.answered_at <= room.question_start_time + room.answer_time * 1000;
        if (player.answered_current && player.last_answer === body.p_correct_answer && answeredInTime) {
          const elapsedMs = Math.min(
            player.answered_at - room.question_start_time,
            room.answer_time * 1000,
          );
          player.score += room.scoring_type === "equal"
            ? 1000
            : Math.max(100, Math.round(1000 - (elapsedMs / (room.answer_time * 1000)) * 900));
        }
      }
      room.status = "reveal";
      room.settled_question_index = body.p_question_index;
      await this.json(route, { settled: true });
      return;
    }
    if (name === "set_party_room_status") {
      const validTransition =
        room?.host_token === body.p_host_token &&
        room.settled_question_index >= room.current_question &&
        ((body.p_status === "leaderboard" && room.status === "reveal") ||
          (body.p_status === "finished" && ["reveal", "leaderboard"].includes(room.status)));
      if (validTransition && room) {
        room.status = body.p_status;
        if (body.p_status === "finished") room.finished_at = Date.now();
      }
      await this.json(route, null);
      return;
    }
    if (name === "delete_party_room" || name === "leave_party_room") {
      if (name === "delete_party_room" && room?.host_token === body.p_host_token) {
        this.rooms = this.rooms.filter((item) => item.code !== body.p_room_code);
        this.players = this.players.filter((item) => item.room_code !== body.p_room_code);
        this.deletedRooms.add(body.p_room_code);
      } else if (name === "leave_party_room") {
        this.players = this.players.filter((item) =>
          !(
            item.room_code === body.p_room_code &&
            item.id === body.p_player_id &&
            item.player_token === body.p_player_token
          )
        );
      }
      await this.json(route, null);
      return;
    }
    if (name === "set_party_total_players") {
      if (room?.host_token === body.p_host_token) room.total_players = body.p_total_players;
      await this.json(route, null);
      return;
    }
    throw new Error(`Unhandled mocked RPC: ${name}`);
  }
}

async function seedGuestContext(context: BrowserContext, session?: "host" | "guest", user?: { id: string; name: string }) {
  await context.addInitScript(({ session, user, playerId, token }) => {
    if (location.origin === "null") return;
    localStorage.setItem("maydan_guest_mode", "1");
    localStorage.setItem("maydan_onboarding_completed", "1");
    if (user) {
      localStorage.setItem("maydan_user", JSON.stringify({
        userId: user.id, displayName: user.name, isPremium: true,
        rankedGamesToday: 0, stats: {}, powerCards: {},
      }));
    }
    if (session === "host") {
      sessionStorage.setItem("maydan.party.host.session", JSON.stringify({ role: "host", roomCode: "4242", token }));
    } else if (session === "guest") {
      sessionStorage.setItem("maydan.party.guest.session", JSON.stringify({
        role: "guest", roomCode: "4242", playerId, token, nickname: "Guest",
      }));
    }
  }, { session, user, playerId, token });
}

async function expectMirroredRankedScores(first: Page, second: Page) {
  await expect(first.getByTestId("status-ranked-scoreboard")).toBeVisible();
  await expect(second.getByTestId("status-ranked-scoreboard")).toBeVisible();
  const [firstMine, firstOpp, secondMine, secondOpp] = await Promise.all([
    first.getByTestId("text-ranked-my-score").textContent(),
    first.getByTestId("text-ranked-scoreboard-opponent-score").textContent(),
    second.getByTestId("text-ranked-my-score").textContent(),
    second.getByTestId("text-ranked-scoreboard-opponent-score").textContent(),
  ]);
  expect(firstMine).toBe(secondOpp);
  expect(firstOpp).toBe(secondMine);
}

test("Party synchronizes answer locking, reveal, reload, final rank, and cleanup", async ({ browser }) => {
  const backend = new MultiplayerBackend();
  backend.seedParty("question");
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    await Promise.all([backend.install(hostContext), backend.install(guestContext)]);
    await Promise.all([seedGuestContext(hostContext, "host"), seedGuestContext(guestContext, "guest")]);
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await Promise.all([
      host.goto(`${appBase}party/host?__e2e=1`),
      guest.goto(`${appBase}party/guest?__e2e=1`),
    ]);
    await expect(host.getByTestId("status-host-question")).toBeVisible();
    await expect(guest.getByTestId("button-party-answer-0")).toBeVisible();

    const questionText = await guest.getByText(/^E2E question \d+$/).textContent();
    const questionNumber = Number(questionText?.match(/question (\d+)/)?.[1]);
    const answerIndex = shuffledCorrectIndex(questions[questionNumber - 1]);
    await guest.getByTestId(`button-party-answer-${answerIndex}`).evaluate((button) => {
      for (let index = 0; index < 8; index++) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(guest.getByTestId("status-guest-answer-locked")).toBeVisible();
    await expect(host.getByTestId("status-host-reveal")).toBeVisible();
    expect(backend.partyAnswerCalls).toBe(1);
    expect(backend.players[0].last_answer).toBe(backend.lastPartyCorrectAnswer);
    await expect(guest.getByTestId("status-guest-reveal-result")).toBeVisible();
    const settledScore = backend.players[0].score;
    expect(settledScore).toBeGreaterThan(100);
    expect(settledScore).toBeLessThanOrEqual(1000);
    await expect(guest.getByTestId("text-guest-round-points")).toContainText(String(settledScore));

    // Reconnect the host while reveal is public. The persisted settlement index
    // must prevent a retry from awarding the same question twice.
    await host.reload();
    await expect(host.getByTestId("status-host-reveal")).toBeVisible();
    expect(backend.partySettlementCalls).toBe(1);
    expect(backend.players[0].score).toBe(settledScore);

    await expect(host.getByTestId("status-host-leaderboard")).toBeVisible();
    await expect(guest.getByTestId("status-guest-leaderboard")).toBeVisible();
    await expect(host.getByTestId("row-host-leaderboard-1")).toContainText(String(settledScore));
    await expect(guest.getByTestId("row-guest-leaderboard-1")).toContainText(String(settledScore));

    await guest.reload();
    await expect(guest.getByTestId("status-guest-leaderboard")).toBeVisible();
    await host.getByTestId("button-host-next-question").click();
    await expect(host.getByTestId("status-host-party-finished")).toBeVisible();
    await expect(guest.getByTestId("status-guest-party-finished")).toBeVisible();
    await expect(host.getByTestId("podium-host-final")).toContainText("Guest");
    await expect(guest.getByTestId("podium-guest-final")).toContainText("Guest");

    await host.getByTestId("button-host-new-party").click();
    await expect.poll(() => backend.rooms.length).toBe(0);
  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close()]);
    backend.rooms = [];
    backend.players = [];
  }
});

test("Party rejects a late answer and cleans guests up after host departure", async ({ browser }) => {
  const backend = new MultiplayerBackend();
  backend.seedParty("question", Date.now() - 10_000);
  const guestContext = await browser.newContext();
  const hostContext = await browser.newContext();
  try {
    await Promise.all([backend.install(guestContext), backend.install(hostContext)]);
    await Promise.all([seedGuestContext(guestContext, "guest"), seedGuestContext(hostContext, "host")]);
    const guest = await guestContext.newPage();
    await guest.goto(`${appBase}party/guest?__e2e=1`);
    const answer = guest.getByTestId("button-party-answer-0");
    await expect(answer).toBeDisabled();
    await answer.dispatchEvent("click");
    expect(backend.partyAnswerCalls).toBe(0);

    // Closing the host stops its heartbeat. Once the lease expires, maintenance
    // first finishes the room so every remaining guest sees the same final state.
    backend.rooms[0].status = "lobby";
    const host = await hostContext.newPage();
    await host.goto(`${appBase}party/host?__e2e=1`);
    await expect(host.getByTestId("text-party-room-code")).toHaveText("4242");
    await hostContext.close();
    backend.expireHostLease();
    await expect(guest.getByTestId("status-guest-party-finished")).toBeVisible();
    expect(backend.rooms[0].status).toBe("finished");

    // After the finished-room retention window, the same maintenance contract
    // deletes both room and players and the guest clears its capability session.
    backend.expireRoomRetention();
    await expect(guest.getByText("انتهت الغرفة وتم تنظيفها بعد انقطاع المضيف.")).toBeVisible();
    expect(backend.rooms).toHaveLength(0);
    expect(backend.players).toHaveLength(0);
  } finally {
    await Promise.allSettled([guestContext.close(), hostContext.close()]);
    backend.rooms = [];
    backend.players = [];
  }
});

test("Ranked synchronizes simultaneous answers, rapid taps, reveals, scores, and final ranks", async ({ browser }) => {
  const backend = new MultiplayerBackend();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    await Promise.all([backend.install(firstContext), backend.install(secondContext)]);
    await Promise.all([
      seedGuestContext(firstContext, undefined, { id: "ranked-player-1", name: "Player One" }),
      seedGuestContext(secondContext, undefined, { id: "ranked-player-2", name: "Player Two" }),
    ]);
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await Promise.all([
      first.goto(`${appBase}ranked?__e2e=1`),
      second.goto(`${appBase}ranked?__e2e=1`),
    ]);
    await Promise.all([
      first.getByRole("button", { name: /ابحث عن خصم/ }).click(),
      second.getByRole("button", { name: /ابحث عن خصم/ }).click(),
    ]);
    await expect(first.getByTestId("status-ranked-question")).toBeVisible();
    await expect(second.getByTestId("status-ranked-question")).toBeVisible();

    await Promise.all([
      first.getByTestId("button-ranked-answer-0").evaluate((button) => {
        for (let index = 0; index < 10; index++) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }),
      second.getByTestId("button-ranked-answer-1").click(),
    ]);
    await expect(first.getByTestId("status-ranked-reveal")).toBeVisible();
    await expect(second.getByTestId("status-ranked-reveal")).toBeVisible();
    await expectMirroredRankedScores(first, second);
    expect(backend.matches[0].player1_answers).toHaveLength(1);
    expect(backend.matches[0].player2_answers).toHaveLength(1);
    expect(backend.rankedAnswerWrites).toEqual({ player1: 1, player2: 1 });

    await expect(first.getByTestId("status-ranked-question")).toBeVisible();
    await expect(second.getByTestId("status-ranked-question")).toBeVisible();
    // Deliberately do not answer question two: both clients must submit one
    // authoritative null after the deadline and still transition together.
    await expect(first.getByTestId("status-ranked-final-result")).toBeVisible();
    await expect(second.getByTestId("status-ranked-final-result")).toBeVisible();
    const match = backend.matches[0];
    expect(match.player1_answers[1]).toMatchObject({ ans: null, pts: 0 });
    expect(match.player2_answers[1]).toMatchObject({ ans: null, pts: 0 });
    expect(backend.rankedAnswerWrites).toEqual({ player1: 2, player2: 2 });
    const firstScore = match.player1_id === "ranked-player-1" ? match.player1_score : match.player2_score;
    const secondScore = match.player1_id === "ranked-player-2" ? match.player1_score : match.player2_score;
    await expect(first.getByTestId("text-ranked-final-my-score")).toHaveText(String(firstScore));
    await expect(second.getByTestId("text-ranked-final-my-score")).toHaveText(String(secondScore));
    await expect(first.getByTestId("text-ranked-rating-delta")).toBeVisible();
    await expect(second.getByTestId("text-ranked-resulting-rank")).toContainText("الرتبة الناتجة");
  } finally {
    await Promise.allSettled([firstContext.close(), secondContext.close()]);
    backend.queue = [];
    backend.matches = [];
  }
});