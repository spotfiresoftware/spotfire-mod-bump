export type Circle = {
    cx: number;
    cy: number;
    r: number;
};

export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export function circleInRect(circle: Circle, rect: Rect): boolean {
    return (
        circle.cx + circle.r > rect.x &&
        circle.cx - circle.r < rect.x + rect.width &&
        circle.cy + circle.r > rect.y &&
        circle.cy - circle.r < rect.y + rect.height
    );
}
