import dotenv from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server } from "socket.io";
import { z } from "zod";
import { handle } from "hono/vercel";

// Configure dotenv at the start of your application
dotenv.config();

// Zod Schemas
const CardSchema = z.object({
  value: z.number().min(1).max(13),
  suit: z.enum(["hearts", "diamonds", "clubs", "spades"]),
});

const TeamSchema = z.object({
  player1: z.string(),
  player2: z.string(),
});

const PlaySchema = z.object({
  id: z.string(),
  userId: z.string(),
  timestamp: z.number(),
  card: CardSchema,
});

const CreateMatchBodySchema = z.object({
  team1: TeamSchema,
  team2: TeamSchema,
});

// Types from Zod Schemas
type Card = z.infer<typeof CardSchema>;
type Team = z.infer<typeof TeamSchema>;
type Play = z.infer<typeof PlaySchema>;
type RoundKey = "round1" | "round2" | "round3";

type GameState = {
  team1: Team;
  team2: Team;
  currentTurn: string;
  currentRound: RoundKey;
  roundWinners?: {
    [key in RoundKey]?: "team1" | "team2";
  };
  winner?: "team1" | "team2";
  gameComplete?: boolean;
};

type Match = {
  state: GameState;
  rounds: {
    [key in RoundKey]: Play[];
  };
};

// Global state
const matches: Record<string, Match> = {};

const app = new Hono().basePath("/api");
app.use("/api/*", cors());

const port = process.env.PORT as unknown as number;

// Create server instance
const server = serve({
  fetch: app.fetch,
  port,
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log("Client connected");

  // Allow clients to subscribe to specific match updates
  socket.on("subscribeToMatch", (matchId: string) => {
    socket.join(matchId);
    console.log(`Client subscribed to match ${matchId}`);
  });

  socket.on("unsubscribeFromMatch", (matchId: string) => {
    socket.leave(matchId);
    console.log(`Client unsubscribed from match ${matchId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Helper function to emit match updates
function emitMatchUpdate(matchId: string, match: Match) {
  console.log("Emitting match update for matchId:", matchId);
  console.log("Match data being emitted:", {
    matchId,
    state: match.state,
    summary: {
      currentRound: match.state.currentRound,
      currentTurn: match.state.currentTurn,
      roundWinners: match.state.roundWinners,
      gameWinner: match.state.winner,
      isComplete: match.state.gameComplete,
    },
  });

  io.to(matchId).emit("matchUpdate", {
    matchId,
    state: match.state,
    summary: {
      currentRound: match.state.currentRound,
      currentTurn: match.state.currentTurn,
      roundWinners: match.state.roundWinners,
      gameWinner: match.state.winner,
      isComplete: match.state.gameComplete,
    },
  });
}

// Helper functions
function determineRoundWinner(
  plays: Play[],
  state: GameState
): "team1" | "team2" {
  const winningPlay = plays.reduce((highest, current) => {
    return current.card.value > highest.card.value ? current : highest;
  });

  const { team1, team2 } = state;
  if (
    winningPlay.userId === team1.player1 ||
    winningPlay.userId === team1.player2
  ) {
    return "team1";
  }
  return "team2";
}

function determineGameWinner(
  rounds: Match["rounds"],
  state: GameState
): "team1" | "team2" | undefined {
  let team1Wins = 0;
  let team2Wins = 0;

  Object.values(rounds).forEach((roundPlays) => {
    if (roundPlays.length === 4) {
      const roundWinner = determineRoundWinner(roundPlays, state);
      if (roundWinner === "team1") team1Wins++;
      if (roundWinner === "team2") team2Wins++;
    }
  });

  if (team1Wins >= 2) return "team1";
  if (team2Wins >= 2) return "team2";
  return undefined;
}

function getNextPlayer(state: GameState, currentPlayer: string): string {
  const { team1, team2 } = state;

  if (currentPlayer === team1.player1 || currentPlayer === team1.player2) {
    return currentPlayer === team1.player1 ? team2.player1 : team2.player2;
  }
  return currentPlayer === team2.player1 ? team1.player2 : team1.player1;
}

// Routes
app.post("/v1/match/create", async (c) => {
  try {
    const matchId = crypto.randomUUID();
    const body = await c.req.json();

    // Validate request body with Zod
    const validatedBody = CreateMatchBodySchema.parse(body);

    matches[matchId] = {
      state: {
        team1: validatedBody.team1,
        team2: validatedBody.team2,
        currentTurn: validatedBody.team1.player1,
        currentRound: "round1",
        roundWinners: {},
      },
      rounds: {
        round1: [],
        round2: [],
        round3: [],
      },
    };

    // Emit update for new match
    emitMatchUpdate(matchId, matches[matchId]);

    return c.json({ matchId, state: matches[matchId] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/match/:matchId", async (c) => {
  try {
    const matchId = c.req.param("matchId");

    // Validate match exists
    if (!matches[matchId]) {
      return c.json({ error: "Match not found" }, 404);
    }

    const match = matches[matchId];

    return c.json({
      matchId,
      state: match.state,
      rounds: match.rounds,
      summary: {
        currentRound: match.state.currentRound,
        currentTurn: match.state.currentTurn,
        roundWinners: match.state.roundWinners,
        gameWinner: match.state.winner,
        isComplete: match.state.gameComplete,
      },
    });
  } catch (error) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/match/:matchId/plays", async (c) => {
  try {
    const matchId = c.req.param("matchId");

    // Validate match exists
    if (!matches[matchId]) {
      return c.json({ error: "Match not found" }, 404);
    }

    const match = matches[matchId];

    return c.json({
      matchId,
      plays: {
        round1: match.rounds.round1,
        round2: match.rounds.round2,
        round3: match.rounds.round3,
      },
    });
  } catch (error) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/:matchId/:userId/:cardvalue/:suit", async (c) => {
  try {
    const matchId = c.req.param("matchId");
    const userId = c.req.param("userId");
    const cardValue = parseInt(c.req.param("cardvalue"));
    const suit = c.req.param("suit");

    // Validate match exists
    if (!matches[matchId]) {
      return c.json({ error: "Match not found" }, 404);
    }

    // Validate card data with Zod
    const validatedCard = CardSchema.parse({
      value: cardValue,
      suit: suit,
    });

    const match = matches[matchId];
    const { state, rounds } = match;

    // Validate it's the player's turn
    if (state.currentTurn !== userId) {
      return c.json({ error: "Not your turn" }, 400);
    }

    const play: Play = {
      id: crypto.randomUUID(),
      userId,
      timestamp: Date.now(),
      card: validatedCard,
    };

    const currentRoundPlays = rounds[state.currentRound];
    currentRoundPlays.push(play);

    // Update next turn
    state.currentTurn = getNextPlayer(state, userId);

    // Check if round is complete
    if (currentRoundPlays.length === 4) {
      const roundWinner = determineRoundWinner(currentRoundPlays, state);
      state.roundWinners![state.currentRound] = roundWinner;

      // Move to next round
      if (state.currentRound === "round1") {
        state.currentRound = "round2";
      } else if (state.currentRound === "round2") {
        state.currentRound = "round3";
      }

      // Check for game winner
      const gameWinner = determineGameWinner(rounds, state);
      if (gameWinner) {
        state.winner = gameWinner;
        state.gameComplete = true;
      }
    }

    // Emit update after play
    emitMatchUpdate(matchId, matches[matchId]);

    return c.json({
      match: matches[matchId],
      currentRound: state.currentRound,
      roundWinners: state.roundWinners,
      winner: state.winner,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/matches/active", async (c) => {
  try {
    const activeMatches = Object.entries(matches)
      .filter(([_, match]) => !match.state.gameComplete)
      .map(([matchId, match]) => ({
        matchId,
        state: match.state,
        summary: {
          currentRound: match.state.currentRound,
          currentTurn: match.state.currentTurn,
          roundWinners: match.state.roundWinners,
        },
      }));

    return c.json({ matches: activeMatches });
  } catch (error) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

// Basic health check route
app.get("/", (c) => {
  return c.text("Hello Hono!");
});

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;

console.log(`Server is running on http://localhost:${process.env.PORT}`);
