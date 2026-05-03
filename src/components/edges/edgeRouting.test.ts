import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  routeCrossesObstacle,
  routeEdgeAroundObstacles,
  type EdgeRouteObstacle,
} from "./edgeRouting";

const obstacle: EdgeRouteObstacle = {
  id: "table-posts",
  left: 100,
  top: 100,
  right: 340,
  bottom: 360,
};

const targetObstacle: EdgeRouteObstacle = {
  id: "table-users",
  left: 100,
  top: 520,
  right: 340,
  bottom: 780,
};

const routeBodyPoints = (points: { x: number; y: number }[]) =>
  points.slice(1, -1);

describe("edge routing", () => {
  it("returns a direct elbow route when no obstacles are present", () => {
    const route = routeEdgeAroundObstacles({
      source: { x: 0, y: 100 },
      sourcePosition: Position.Right,
      target: { x: 240, y: 180 },
      targetPosition: Position.Left,
      obstacles: [],
    });

    expect(route).not.toBeNull();
    expect(route?.path).toContain("M 0 100");
    expect(route?.labelX).toBeGreaterThan(0);
    expect(route?.labelY).toBeGreaterThanOrEqual(100);
  });

  it("routes around blocking rectangles", () => {
    const route = routeEdgeAroundObstacles({
      source: { x: 0, y: 220 },
      sourcePosition: Position.Right,
      target: { x: 500, y: 220 },
      targetPosition: Position.Left,
      obstacles: [obstacle],
    });

    expect(route).not.toBeNull();
    expect(routeCrossesObstacle(route?.points ?? [], [obstacle])).toBe(false);
  });

  it("routes out of the source block before avoiding terminal rectangles", () => {
    const route = routeEdgeAroundObstacles({
      source: { x: obstacle.right, y: 220 },
      sourcePosition: Position.Right,
      sourceObstacle: obstacle,
      target: { x: targetObstacle.left, y: 620 },
      targetPosition: Position.Left,
      targetObstacle,
      obstacles: [],
    });

    expect(route).not.toBeNull();
    expect(route?.points[1]?.x).toBeGreaterThan(obstacle.right + 50);
    expect(routeCrossesObstacle(routeBodyPoints(route?.points ?? []), [
      obstacle,
      targetObstacle,
    ])).toBe(false);
  });

  it("keeps screenshot-style foreign key routes outside both tables", () => {
    const middleTable: EdgeRouteObstacle = {
      id: "table-comments",
      left: 460,
      top: 300,
      right: 700,
      bottom: 620,
    };
    const route = routeEdgeAroundObstacles({
      source: { x: obstacle.right, y: 310 },
      sourcePosition: Position.Right,
      sourceObstacle: obstacle,
      target: { x: targetObstacle.left, y: 610 },
      targetPosition: Position.Left,
      targetObstacle,
      obstacles: [middleTable],
    });

    expect(route).not.toBeNull();
    expect(routeCrossesObstacle(routeBodyPoints(route?.points ?? []), [
      obstacle,
      targetObstacle,
      middleTable,
    ])).toBe(false);
  });

  it("keeps rounded corners clear when tables are tightly stacked", () => {
    const closeTarget: EdgeRouteObstacle = {
      id: "table-users-close",
      left: 100,
      top: 420,
      right: 340,
      bottom: 680,
    };
    const route = routeEdgeAroundObstacles({
      source: { x: obstacle.right, y: 320 },
      sourcePosition: Position.Right,
      sourceObstacle: obstacle,
      target: { x: closeTarget.left, y: 540 },
      targetPosition: Position.Left,
      targetObstacle: closeTarget,
      obstacles: [],
    });

    expect(route).not.toBeNull();
    expect(routeCrossesObstacle(routeBodyPoints(route?.points ?? []), [
      obstacle,
      closeTarget,
    ])).toBe(false);
    expect(route?.points.some((point) => point.y === 383)).toBe(false);
  });

  it("returns null when no orthogonal candidate can avoid obstacles", () => {
    const route = routeEdgeAroundObstacles({
      source: { x: 40, y: 220 },
      sourcePosition: Position.Right,
      target: { x: 460, y: 220 },
      targetPosition: Position.Left,
      obstacles: [
        {
          id: "wall",
          left: -1000,
          top: -1000,
          right: 1000,
          bottom: 1000,
        },
      ],
    });

    expect(route).toBeNull();
  });
});
