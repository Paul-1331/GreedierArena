/**
 * Glicko-2 Rating System Implementation
 * Based on Mark Glickman's paper: http://www.glicko.net/glicko/glicko2.pdf
 *
 * Default values: rating=1500, deviation=350, volatility=0.06
 * System constant τ (tau) controls volatility change speed.
 */

const TAU = 0.5; // System constant — smaller = less volatility change
const EPSILON = 0.000001; // Convergence tolerance
const GLICKO2_SCALE = 173.7178; // Converts between Glicko and Glicko-2 scales

export interface GlickoPlayer {
  rating: number;      // Glicko-1 scale (e.g. 1500)
  deviation: number;   // RD (e.g. 350)
  volatility: number;  // σ (e.g. 0.06)
}

interface Opponent {
  rating: number;
  deviation: number;
  score: number; // 1 = win, 0.5 = draw, 0 = loss
}

// Convert from Glicko-1 to Glicko-2 scale
const toGlicko2 = (rating: number) => (rating - 1500) / GLICKO2_SCALE;
const toGlicko2RD = (rd: number) => rd / GLICKO2_SCALE;
const fromGlicko2 = (mu: number) => mu * GLICKO2_SCALE + 1500;
const fromGlicko2RD = (phi: number) => phi * GLICKO2_SCALE;

const g = (phi: number) => 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));

const E = (mu: number, muj: number, phij: number) =>
  1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/**
 * Calculate updated Glicko-2 ratings for a player after a set of matches.
 */
export function updateRating(player: GlickoPlayer, opponents: Opponent[]): GlickoPlayer {
  if (opponents.length === 0) {
    // No games: only RD increases
    const phi = toGlicko2RD(player.deviation);
    const newPhi = Math.sqrt(phi * phi + player.volatility * player.volatility);
    return {
      rating: player.rating,
      deviation: Math.min(fromGlicko2RD(newPhi), 350),
      volatility: player.volatility,
    };
  }

  const mu = toGlicko2(player.rating);
  const phi = toGlicko2RD(player.deviation);
  const sigma = player.volatility;

  // Step 3: Compute variance v
  let vInv = 0;
  for (const opp of opponents) {
    const muj = toGlicko2(opp.rating);
    const phij = toGlicko2RD(opp.deviation);
    const gPhij = g(phij);
    const eVal = E(mu, muj, phij);
    vInv += gPhij * gPhij * eVal * (1 - eVal);
  }
  const v = 1 / vInv;

  // Step 4: Compute delta
  let deltaSum = 0;
  for (const opp of opponents) {
    const muj = toGlicko2(opp.rating);
    const phij = toGlicko2RD(opp.deviation);
    deltaSum += g(phij) * (opp.score - E(mu, muj, phij));
  }
  const delta = v * deltaSum;

  // Step 5: Determine new volatility (iterative algorithm)
  const a = Math.log(sigma * sigma);
  const phiSq = phi * phi;
  const deltaSq = delta * delta;

  const f = (x: number) => {
    const ex = Math.exp(x);
    const d = phiSq + v + ex;
    return (ex * (deltaSq - phiSq - v - ex)) / (2 * d * d) - (x - a) / (TAU * TAU);
  };

  // Find bounds
  let A = a;
  let B: number;
  if (deltaSq > phiSq + v) {
    B = Math.log(deltaSq - phiSq - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  // Illinois algorithm
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const newSigma = Math.exp(A / 2);

  // Step 6: Update RD
  const phiStar = Math.sqrt(phiSq + newSigma * newSigma);

  // Step 7: Update rating and RD
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  return {
    rating: Math.round(fromGlicko2(newMu)),
    deviation: Math.round(fromGlicko2RD(newPhi) * 100) / 100,
    volatility: Math.round(newSigma * 1000000) / 1000000,
  };
}

/**
 * Given a list of participants sorted by score (descending) from an official match,
 * compute pairwise outcomes and update each player's rating.
 * Returns a map of user_id -> updated GlickoPlayer.
 */
export function computeMatchRatings(
  participants: Array<{
    user_id: string;
    score: number;
    rating: GlickoPlayer;
  }>
): Map<string, GlickoPlayer> {
  const results = new Map<string, GlickoPlayer>();

  for (const player of participants) {
    const opponents: Opponent[] = participants
      .filter((p) => p.user_id !== player.user_id)
      .map((opp) => {
        // Determine outcome: win if higher score, loss if lower, draw if equal
        let s: number;
        if (player.score > opp.score) s = 1;
        else if (player.score < opp.score) s = 0;
        else s = 0.5;

        return {
          rating: opp.rating.rating,
          deviation: opp.rating.deviation,
          score: s,
        };
      });

    results.set(player.user_id, updateRating(player.rating, opponents));
  }

  return results;
}
