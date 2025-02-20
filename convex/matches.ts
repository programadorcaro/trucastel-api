import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// Get a single match by ID
export const get = query({
  args: { id: v.id("matches") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// Get all active matches
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("matches")
      .filter((q) => q.eq(q.field("is_complete"), false))
      .collect();
  },
});

// Create a new match
export const create = mutation({
  args: {
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
    is_complete: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("matches", {
      ...args,
      round1_winner: undefined,
      round2_winner: undefined,
      round3_winner: undefined,
      game_winner: undefined,
    });
  },
});

// Update match state
export const update = mutation({
  args: {
    id: v.id("matches"),
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
  },
  handler: async (ctx, args) => {
    const { id, ...updateData } = args;
    return await ctx.db.patch(id, updateData);
  },
});
