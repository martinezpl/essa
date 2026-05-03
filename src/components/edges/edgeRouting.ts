import { Position } from "@xyflow/react";

export type EdgeRoutePoint = {
  x: number;
  y: number;
};

export type EdgeRouteObstacle = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type RouteCandidate = {
  points: EdgeRoutePoint[];
  score: number;
};

export type EdgeRoute = {
  labelX: number;
  labelY: number;
  path: string;
  points: EdgeRoutePoint[];
};

const OBSTACLE_PADDING = 36;
const HANDLE_OFFSET = 42;
const CORNER_RADIUS = 14;
const ROUTE_CLEARANCE = CORNER_RADIUS + 8;

const expandObstacle = (
  obstacle: EdgeRouteObstacle,
  padding = OBSTACLE_PADDING,
): EdgeRouteObstacle => ({
  id: obstacle.id,
  left: obstacle.left - padding,
  top: obstacle.top - padding,
  right: obstacle.right + padding,
  bottom: obstacle.bottom + padding,
});

const offsetPoint = (
  point: EdgeRoutePoint,
  position: Position,
  distance = HANDLE_OFFSET,
): EdgeRoutePoint => {
  switch (position) {
    case Position.Left:
      return { x: point.x - distance, y: point.y };
    case Position.Right:
      return { x: point.x + distance, y: point.y };
    case Position.Top:
      return { x: point.x, y: point.y - distance };
    case Position.Bottom:
      return { x: point.x, y: point.y + distance };
  }
};

const getTerminalPoint = (
  handlePoint: EdgeRoutePoint,
  position: Position,
  obstacle?: EdgeRouteObstacle,
): EdgeRoutePoint => {
  if (!obstacle) {
    return offsetPoint(handlePoint, position);
  }

  const expanded = expandObstacle(obstacle);

  switch (position) {
    case Position.Left:
      return { x: expanded.left - ROUTE_CLEARANCE, y: handlePoint.y };
    case Position.Right:
      return { x: expanded.right + ROUTE_CLEARANCE, y: handlePoint.y };
    case Position.Top:
      return { x: handlePoint.x, y: expanded.top - ROUTE_CLEARANCE };
    case Position.Bottom:
      return { x: handlePoint.x, y: expanded.bottom + ROUTE_CLEARANCE };
  }
};

const normalizePoints = (points: EdgeRoutePoint[]) =>
  points.filter((point, index) => {
    const previous = points[index - 1];

    return !previous || previous.x !== point.x || previous.y !== point.y;
  });

const segmentIntersectsObstacle = (
  start: EdgeRoutePoint,
  end: EdgeRoutePoint,
  obstacle: EdgeRouteObstacle,
) => {
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    return start.x >= obstacle.left &&
      start.x <= obstacle.right &&
      maxY >= obstacle.top &&
      minY <= obstacle.bottom;
  }

  if (start.y === end.y) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);

    return start.y >= obstacle.top &&
      start.y <= obstacle.bottom &&
      maxX >= obstacle.left &&
      minX <= obstacle.right;
  }

  return true;
};

const routeIntersectsObstacles = (
  points: EdgeRoutePoint[],
  obstacles: EdgeRouteObstacle[],
) =>
  points.some((point, index) => {
    const nextPoint = points[index + 1];

    return nextPoint
      ? obstacles.some((obstacle) =>
          segmentIntersectsObstacle(point, nextPoint, obstacle),
        )
      : false;
  });

const distance = (start: EdgeRoutePoint, end: EdgeRoutePoint) =>
  Math.abs(start.x - end.x) + Math.abs(start.y - end.y);

const routeLength = (points: EdgeRoutePoint[]) =>
  points.reduce((total, point, index) => {
    const nextPoint = points[index + 1];

    return nextPoint ? total + distance(point, nextPoint) : total;
  }, 0);

const getPointAtLength = (points: EdgeRoutePoint[], targetLength: number) => {
  let walkedLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentLength = distance(start, end);

    if (walkedLength + segmentLength >= targetLength) {
      const progress = segmentLength === 0
        ? 0
        : (targetLength - walkedLength) / segmentLength;

      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
    }

    walkedLength += segmentLength;
  }

  return points[Math.max(0, points.length - 1)];
};

const createRoundedPath = (points: EdgeRoutePoint[]) => {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const commands = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const previousLength = distance(previous, current);
    const nextLength = distance(current, next);
    const radius = Math.min(CORNER_RADIUS, previousLength / 2, nextLength / 2);

    if (radius <= 0) {
      commands.push(`L ${current.x} ${current.y}`);
      continue;
    }

    const beforeCorner = {
      x: current.x + Math.sign(previous.x - current.x) * radius,
      y: current.y + Math.sign(previous.y - current.y) * radius,
    };
    const afterCorner = {
      x: current.x + Math.sign(next.x - current.x) * radius,
      y: current.y + Math.sign(next.y - current.y) * radius,
    };

    commands.push(`L ${beforeCorner.x} ${beforeCorner.y}`);
    commands.push(`Q ${current.x} ${current.y} ${afterCorner.x} ${afterCorner.y}`);
  }

  const lastPoint = points[points.length - 1];
  commands.push(`L ${lastPoint.x} ${lastPoint.y}`);

  return commands.join(" ");
};

const createCandidate = (points: EdgeRoutePoint[]): RouteCandidate => {
  const normalizedPoints = normalizePoints(points);

  return {
    points: normalizedPoints,
    score: routeLength(normalizedPoints) + normalizedPoints.length * 12,
  };
};

const buildCandidates = (
  start: EdgeRoutePoint,
  end: EdgeRoutePoint,
  obstacles: EdgeRouteObstacle[],
) => {
  const yLanes = [
    ...new Set(
      obstacles.flatMap((obstacle) => [
        obstacle.top - ROUTE_CLEARANCE,
        obstacle.bottom + ROUTE_CLEARANCE,
      ]),
    ),
  ].sort((left, right) => left - right);
  const xLanes = [
    ...new Set(
      obstacles.flatMap((obstacle) => [
        obstacle.left - ROUTE_CLEARANCE,
        obstacle.right + ROUTE_CLEARANCE,
      ]),
    ),
  ].sort((left, right) => left - right);
  const candidates = [
    createCandidate([start, { x: end.x, y: start.y }, end]),
    createCandidate([start, { x: start.x, y: end.y }, end]),
  ];

  yLanes.forEach((lane) => {
    candidates.push(
      createCandidate([
        start,
        { x: start.x, y: lane },
        { x: end.x, y: lane },
        end,
      ]),
    );
  });

  xLanes.forEach((lane) => {
    candidates.push(
      createCandidate([
        start,
        { x: lane, y: start.y },
        { x: lane, y: end.y },
        end,
      ]),
    );
  });

  xLanes.forEach((xLane) => {
    yLanes.forEach((yLane) => {
      candidates.push(
        createCandidate([
          start,
          { x: xLane, y: start.y },
          { x: xLane, y: yLane },
          { x: end.x, y: yLane },
          end,
        ]),
      );
      candidates.push(
        createCandidate([
          start,
          { x: start.x, y: yLane },
          { x: xLane, y: yLane },
          { x: xLane, y: end.y },
          end,
        ]),
      );
    });
  });

  return candidates;
};

export const routeEdgeAroundObstacles = ({
  obstacles,
  source,
  sourceObstacle,
  sourcePosition,
  target,
  targetObstacle,
  targetPosition,
}: {
  obstacles: EdgeRouteObstacle[];
  source: EdgeRoutePoint;
  sourceObstacle?: EdgeRouteObstacle;
  sourcePosition: Position;
  target: EdgeRoutePoint;
  targetObstacle?: EdgeRouteObstacle;
  targetPosition: Position;
}): EdgeRoute | null => {
  const expandedUnrelatedObstacles = obstacles.map((obstacle) =>
    expandObstacle(obstacle),
  );
  const expandedSourceObstacle = sourceObstacle
    ? expandObstacle(sourceObstacle)
    : null;
  const expandedTargetObstacle = targetObstacle
    ? expandObstacle(targetObstacle)
    : null;
  const expandedObstacles = [
    ...expandedUnrelatedObstacles,
    ...(expandedSourceObstacle ? [expandedSourceObstacle] : []),
    ...(expandedTargetObstacle ? [expandedTargetObstacle] : []),
  ];
  const sourceExit = getTerminalPoint(source, sourcePosition, sourceObstacle);
  const targetEntry = getTerminalPoint(target, targetPosition, targetObstacle);
  const sourceStubObstacles = [
    ...expandedUnrelatedObstacles,
    ...(expandedTargetObstacle ? [expandedTargetObstacle] : []),
  ];
  const targetStubObstacles = [
    ...expandedUnrelatedObstacles,
    ...(expandedSourceObstacle ? [expandedSourceObstacle] : []),
  ];

  if (
    sourceStubObstacles.some((obstacle) =>
      segmentIntersectsObstacle(source, sourceExit, obstacle),
    ) ||
    targetStubObstacles.some((obstacle) =>
      segmentIntersectsObstacle(targetEntry, target, obstacle),
    )
  ) {
    return null;
  }

  const candidates = buildCandidates(sourceExit, targetEntry, expandedObstacles)
    .filter((candidate) =>
      !routeIntersectsObstacles(candidate.points, expandedObstacles),
    )
    .map((candidate) =>
      createCandidate([source, ...candidate.points, target]),
    )
    .sort((left, right) => left.score - right.score);

  const route = candidates[0];

  if (!route) {
    return null;
  }

  const midpoint = getPointAtLength(route.points, routeLength(route.points) / 2);

  return {
    labelX: midpoint.x,
    labelY: midpoint.y,
    path: createRoundedPath(route.points),
    points: route.points,
  };
};

export const routeCrossesObstacle = (
  points: EdgeRoutePoint[],
  obstacles: EdgeRouteObstacle[],
) => routeIntersectsObstacles(points, obstacles.map((obstacle) => expandObstacle(obstacle)));
