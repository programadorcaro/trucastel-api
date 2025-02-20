import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  matches: defineTable({
    team1_player1: v.string(),
    team1_player2: v.string(),
    team2_player1: v.string(),
    team2_player2: v.string(),
    current_turn: v.string(),
    current_round: v.union(
      v.literal("round1"),
      v.literal("round2"),
      v.literal("round3")
    ),
    round1_winner: v.optional(v.union(v.literal("team1"), v.literal("team2"))),
    round2_winner: v.optional(v.union(v.literal("team1"), v.literal("team2"))),
    round3_winner: v.optional(v.union(v.literal("team1"), v.literal("team2"))),
    game_winner: v.optional(v.union(v.literal("team1"), v.literal("team2"))),
    is_complete: v.boolean(),
  }).index("by_is_complete", ["is_complete"]),

  plays: defineTable({
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
  })
    .index("by_match_and_round", ["match_id", "round"])
    .index("by_match_and_timestamp", ["match_id", "timestamp"]),
});
