import dotenv from "dotenv";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { handle } from "hono/vercel";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

// Configure dotenv at the start of your application
dotenv.config();

// Validate that the environment variable exists
if (!process.env.CONVEX_URL) {
  throw new Error("CONVEX_URL environment variable is not set");
}

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

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

// Routes
app.post("/v1/match/create", async (c) => {
  try {
    const body = await c.req.json();
    const validatedBody = CreateMatchBodySchema.parse(body);

    const matchId = await convex.mutation(api.matches.create, {
      team1_player1: validatedBody.team1.player1,
      team1_player2: validatedBody.team1.player2,
      team2_player1: validatedBody.team2.player1,
      team2_player2: validatedBody.team2.player2,
      current_turn: validatedBody.team1.player1, // Start with team1's player1
      current_round: "round1",
      is_complete: false,
    });

    const match = await convex.query(api.matches.get, { id: matchId });
    return c.json({ matchId, state: match });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/match/:matchId", async (c) => {
  try {
    const matchId = c.req.param("matchId") as Id<"matches">;
    const match = await convex.query(api.matches.get, { id: matchId });

    if (!match) {
      return c.json({ error: "Match not found" }, 404);
    }

    const plays = await convex.query(api.plays.getByMatch, { matchId });

    // Transform match data to match API format
    const response = {
      matchId,
      state: {
        team1: {
          player1: match.team1_player1,
          player2: match.team1_player2,
        },
        team2: {
          player1: match.team2_player1,
          player2: match.team2_player2,
        },
        currentTurn: match.current_turn,
        currentRound: match.current_round,
        roundWinners: {
          round1: match.round1_winner,
          round2: match.round2_winner,
          round3: match.round3_winner,
        },
        winner: match.game_winner,
        gameComplete: match.is_complete,
      },
      rounds: {
        round1: plays.filter((p) => p.round === "round1"),
        round2: plays.filter((p) => p.round === "round2"),
        round3: plays.filter((p) => p.round === "round3"),
      },
      summary: {
        currentRound: match.current_round,
        currentTurn: match.current_turn,
        roundWinners: {
          round1: match.round1_winner,
          round2: match.round2_winner,
          round3: match.round3_winner,
        },
        gameWinner: match.game_winner,
        isComplete: match.is_complete,
      },
    };

    return c.json(response);
  } catch (error) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/match/:matchId/plays", async (c) => {
  try {
    const matchId = c.req.param("matchId") as Id<"matches">;
    const plays = await convex.query(api.plays.getByMatch, { matchId });

    if (!plays) {
      return c.json({ error: "Match not found" }, 404);
    }

    return c.json({
      matchId,
      plays: {
        round1: plays
          .filter((p) => p.round === "round1")
          .map((p) => ({
            id: p._id,
            userId: p.user_id,
            timestamp: p.timestamp,
            card: {
              value: p.card_value,
              suit: p.card_suit,
            },
          })),
        round2: plays
          .filter((p) => p.round === "round2")
          .map((p) => ({
            id: p._id,
            userId: p.user_id,
            timestamp: p.timestamp,
            card: {
              value: p.card_value,
              suit: p.card_suit,
            },
          })),
        round3: plays
          .filter((p) => p.round === "round3")
          .map((p) => ({
            id: p._id,
            userId: p.user_id,
            timestamp: p.timestamp,
            card: {
              value: p.card_value,
              suit: p.card_suit,
            },
          })),
      },
    });
  } catch (error) {
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/:matchId/:userId/:cardvalue/:suit", async (c) => {
  try {
    const matchId = c.req.param("matchId") as Id<"matches">;
    const userId = c.req.param("userId");
    const cardValue = parseInt(c.req.param("cardvalue"));
    const suit = c.req.param("suit");

    const match = await convex.query(api.matches.get, { id: matchId });
    if (!match) {
      return c.json({ error: "Match not found" }, 404);
    }

    // Validate card data
    const validatedCard = CardSchema.parse({
      value: cardValue,
      suit: suit,
    });

    // Validate it's the player's turn
    if (match.current_turn !== userId) {
      return c.json({ error: "Not your turn" }, 400);
    }

    // Create the play
    await convex.mutation(api.plays.create, {
      match_id: matchId as Id<"matches">,
      user_id: userId,
      round: match.current_round,
      timestamp: Date.now(),
      card_value: validatedCard.value,
      card_suit: validatedCard.suit,
    });

    // Get updated match state
    const updatedMatch = await convex.query(api.matches.get, {
      id: matchId as Id<"matches">,
    });
    const plays = await convex.query(api.plays.getByMatch, {
      matchId: matchId as Id<"matches">,
    });

    if (!updatedMatch || !plays) {
      return c.json({ error: "Match or plays not found" }, 404);
    }

    return c.json({
      match: {
        state: {
          team1: {
            player1: updatedMatch.team1_player1,
            player2: updatedMatch.team1_player2,
          },
          team2: {
            player1: updatedMatch.team2_player1,
            player2: updatedMatch.team2_player2,
          },
          currentTurn: updatedMatch.current_turn,
          currentRound: updatedMatch.current_round,
          roundWinners: {
            round1: updatedMatch.round1_winner,
            round2: updatedMatch.round2_winner,
            round3: updatedMatch.round3_winner,
          },
          winner: updatedMatch.game_winner,
          gameComplete: updatedMatch.is_complete,
        },
        rounds: {
          round1: plays.filter((p) => p.round === "round1"),
          round2: plays.filter((p) => p.round === "round2"),
          round3: plays.filter((p) => p.round === "round3"),
        },
      },
      currentRound: updatedMatch.current_round,
      roundWinners: {
        round1: updatedMatch.round1_winner,
        round2: updatedMatch.round2_winner,
        round3: updatedMatch.round3_winner,
      },
      winner: updatedMatch.game_winner,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }
    return c.json({ error: "Invalid request" }, 400);
  }
});

app.get("/v1/matches/active", async (c) => {
  const activeMatches = await convex.query(api.matches.getActive);
  return c.json({ matches: activeMatches });
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
