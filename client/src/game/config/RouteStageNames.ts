import type { SharkRoute } from "../../network/protocol";

export const ROUTE_STAGE_NAMES: Record<SharkRoute, string[]> = {
  "attack":     ["シュモクザメ", "イタチザメ", "アオザメ", "ホオジロザメ", "メガロドン"],
  "non-attack": ["ドチザメ", "ネムリブカ", "シロワニ", "ウバザメ", "ジンベエザメ"],
  "deep-sea":   ["ツラナガコビトザメ", "ノコギリザメ", "ラブカ", "ミツクリザメ", "ニシオンデンザメ"],
  "human":      ["人間", "人間", "人間", "人間", "人間"],
};
