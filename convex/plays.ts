import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// Get all plays for a match
export const getByMatch = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    return await ctx.db
      .query("plays")
      .filter((q) => q.eq(q.field("match_id"), matchId))
      .collect();
  },
});

// Create a new play
export const create = mutation({
  args: {
    match_id: v.id("matches"),
    user_id: v.string(),
    round: v.union(
      v.literal("round1"),
      v.literal("round2"),
      v.literal("round3")
    ),
    timestamp: v.number(),
    card_value: v.number(),
    card_suit: v.union(
      v.literal("hearts"),
      v.literal("diamonds"),
      v.literal("clubs"),
      v.literal("spades")
    ),
  },
  handler: async (ctx, args) => {
    // Get current match state
    const match = await ctx.db.get(args.match_id);
    if (!match) throw new Error("Match not found");
    if (match.current_turn !== args.user_id) throw new Error("Not your turn");

    // Insert the play
    const playId = await ctx.db.insert("plays", args);

    // Get all plays for current round
    const roundPlays = await ctx.db
      .query("plays")
      .filter((q) =>
        q.and(
          q.eq(q.field("match_id"), args.match_id),
          q.eq(q.field("round"), args.round)
        )
      )
      .collect();

    // Determine next state
    let updateData: any = {
      current_turn: getNextPlayer(match, args.user_id),
    };

    // If round is complete (4 plays)
    if (roundPlays.length === 4) {
      const roundWinner = determineRoundWinner(roundPlays, match);
      updateData[`${args.round}_winner`] = roundWinner;

      // Update round if needed
      if (args.round === "round1") {
        updateData.current_round = "round2";
      } else if (args.round === "round2") {
        updateData.current_round = "round3";
      }

      // Check for game winner
      if (
        (match.round1_winner === "team1" && match.round2_winner === "team1") ||
        (match.round1_winner === "team1" &&
          match.round2_winner === "team2" &&
          roundWinner === "team1") ||
        (match.round1_winner === "team2" &&
          match.round2_winner === "team1" &&
          roundWinner === "team1")
      ) {
        updateData.game_winner = "team1";
        updateData.is_complete = true;
      } else if (
        (match.round1_winner === "team2" && match.round2_winner === "team2") ||
        (match.round1_winner === "team1" &&
          match.round2_winner === "team2" &&
          roundWinner === "team2") ||
        (match.round1_winner === "team2" &&
          match.round2_winner === "team1" &&
          roundWinner === "team2")
      ) {
        updateData.game_winner = "team2";
        updateData.is_complete = true;
      }
    }

    await ctx.db.patch(args.match_id, updateData);

    return playId;
  },
});

// Helper functions
function getNextPlayer(match: any, currentPlayer: string): string {
  if (currentPlayer === match.team1_player1) return match.team2_player1;
  if (currentPlayer === match.team2_player1) return match.team1_player2;
  if (currentPlayer === match.team1_player2) return match.team2_player2;
  return match.team1_player1;
}

function determineRoundWinner(plays: any[], match: any): "team1" | "team2" {
  const winningPlay = plays.reduce((highest, current) => {
    return current.card_value > highest.card_value ? current : highest;
  });

  if (
    winningPlay.user_id === match.team1_player1 ||
    winningPlay.user_id === match.team1_player2
  ) {
    return "team1";
  }
  return "team2";
}
