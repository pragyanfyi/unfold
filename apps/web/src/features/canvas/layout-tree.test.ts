import { describe, expect, it } from "vitest";
import {
  type LayoutNode,
  LEVEL_GAP,
  layoutTree,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Position,
  SIBLING_GAP,
} from "./layout-tree";

const IDEA: LayoutNode = { id: "idea", parentId: null };
const q = (id: string, parentId = "idea"): LayoutNode => ({ id, parentId });

function at(positions: Map<string, Position>, id: string): Position {
  const position = positions.get(id);
  if (!position) throw new Error(`no position for ${id}`);
  return position;
}

function overlaps(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT;
}

// Columns are checked one at a time: nodes in different columns cannot overlap, because a
// column is wider than a node.
function expectNoOverlap(positions: Map<string, Position>) {
  const columns = new Map<number, Array<number>>();
  for (const { x, y } of positions.values()) {
    const column = columns.get(x);
    if (column) column.push(y);
    else columns.set(x, [y]);
  }
  for (const ys of columns.values()) {
    ys.sort((a, b) => a - b);
    for (let index = 1; index < ys.length; index++) {
      expect(ys[index] - ys[index - 1]).toBeGreaterThanOrEqual(NODE_HEIGHT + SIBLING_GAP);
    }
  }
}

// A tree like an interview: each round hangs its questions off settled questions of earlier
// rounds. Deterministic, so the test does not depend on a random seed.
function interview(rounds: number, perRound: number): Array<LayoutNode> {
  const nodes = [IDEA];
  for (let round = 1; round <= rounds; round++) {
    const earlier = nodes.length;
    for (let n = 1; n <= perRound; n++) {
      const parent = nodes[(round * 7 + n * 13) % earlier];
      nodes.push(q(`r${round}q${n}`, parent.id));
    }
  }
  return nodes;
}

describe("layoutTree", () => {
  it("places nothing for an empty tree, and the idea alone at the origin", () => {
    expect(layoutTree([]).size).toBe(0);
    expect([...layoutTree([IDEA])]).toEqual([["idea", { x: 0, y: 0 }]]);
  });

  it("puts children one column to the right of their parent", () => {
    const nodes = [IDEA, q("r1q1"), q("r1q2"), q("r2q1", "r1q1"), q("r3q1", "r2q1")];
    const positions = layoutTree(nodes);
    for (const node of nodes) {
      if (node.parentId === null) continue;
      expect(at(positions, node.id).x - at(positions, node.parentId).x).toBe(
        NODE_WIDTH + LEVEL_GAP,
      );
    }
  });

  it("stacks siblings top to bottom in the order given, with the gap between them", () => {
    const positions = layoutTree([IDEA, q("r1q1"), q("r1q2"), q("r1q3")]);
    const ys = ["r1q1", "r1q2", "r1q3"].map((id) => at(positions, id).y);
    expect(ys[1] - ys[0]).toBe(NODE_HEIGHT + SIBLING_GAP);
    expect(ys[2] - ys[1]).toBe(NODE_HEIGHT + SIBLING_GAP);
    // The parent sits level with the middle of its children.
    expect(at(positions, "idea").y).toBe(ys[1]);
  });

  it("keeps the order given, not the order of the id strings", () => {
    // As strings, "r10q1" sorts before "r2q1". Round 2 was asked first, so it stays on top.
    const positions = layoutTree([IDEA, q("r2q1"), q("r10q1")]);
    expect(at(positions, "r2q1").y).toBeLessThan(at(positions, "r10q1").y);
  });

  it("gives children of different parents more room than siblings", () => {
    const positions = layoutTree([
      IDEA,
      q("r1q1"),
      q("r1q2"),
      q("r2q1", "r1q1"),
      q("r2q2", "r1q2"),
    ]);
    const gap = at(positions, "r2q2").y - at(positions, "r2q1").y;
    expect(gap).toBeGreaterThan(NODE_HEIGHT + SIBLING_GAP);
  });

  it("never overlaps two nodes", () => {
    const positions = layoutTree(interview(12, 4));
    expect(positions.size).toBe(49);
    expectNoOverlap(positions);
    // The column check above relies on this.
    const all = [...positions.values()];
    expect(all.some((a, i) => all.some((b, j) => i < j && overlaps(a, b)))).toBe(false);
  });

  it("lays out a 1,000-node tree without overlap", () => {
    const nodes = interview(250, 4).slice(0, 1000);
    const positions = layoutTree(nodes);
    expect(positions.size).toBe(1000);
    expectNoOverlap(positions);
  });

  it("does not depend on what a node shows, only on ids and parents", () => {
    const plain = [IDEA, q("r1q1"), q("r1q2")];
    const rich = plain.map((node) => ({ ...node, state: "settled", decision: "Yes" }));
    expect([...layoutTree(rich)]).toEqual([...layoutTree(plain)]);
  });

  it("keeps existing siblings in the same order when a round adds nodes", () => {
    const before = interview(6, 3);
    const after = interview(7, 3);
    expect(after.slice(0, before.length)).toEqual(before);
    // For each parent, its children among `before`, read top to bottom.
    const siblingOrder = (positions: Map<string, Position>) => {
      const byParent = new Map<string, Array<string>>();
      for (const node of before) {
        if (node.parentId === null) continue;
        byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node.id]);
      }
      for (const ids of byParent.values()) {
        ids.sort((x, y) => at(positions, x).y - at(positions, y).y);
      }
      return [...byParent];
    };
    const given = siblingOrder(new Map(before.map((node, index) => [node.id, { x: 0, y: index }])));
    expect(siblingOrder(layoutTree(before))).toEqual(given);
    expect(siblingOrder(layoutTree(after))).toEqual(given);
  });

  it("gives no position to a node that cannot be reached from the root", () => {
    const positions = layoutTree([IDEA, q("r1q1"), q("r2q1", "missing")]);
    expect([...positions.keys()]).toEqual(["idea", "r1q1"]);
  });
});
