declare module 'd3-org-chart' {
  export class OrgChart<T = unknown> {
    container(el: HTMLElement | string): this;
    data(data: T[] | null): this;
    svgWidth(width: number): this;
    svgHeight(height: number): this;
    nodeWidth(fn: (d: unknown) => number): this;
    nodeHeight(fn: (d: unknown) => number): this;
    childrenMargin(fn: (d: unknown) => number): this;
    siblingsMargin(fn: (d: unknown) => number): this;
    compact(value: boolean): this;
    compactMarginPair(fn: (d: unknown) => number): this;
    compactMarginBetween(fn: (d: unknown) => number): this;
    scaleExtent(extent: [number, number]): this;
    layout(value: string): this;
    initialExpandLevel(level: number): this;
    nodeContent(fn: (d: unknown) => string): this;
    onNodeClick(fn: (d: unknown) => void): this;
    linkUpdate(fn: (this: unknown, d: unknown, i: number, arr: unknown[]) => void): this;
    buttonContent(fn: (args: { node: any; state: unknown }) => string): this;
    defaultFont(font: string): this;
    duration(ms: number): this;
    imageName(name: string): this;
    render(): this;
    fit(options?: { animate?: boolean }): this;
    expandAll(): this;
    collapseAll(): this;
    exportImg(options?: { full?: boolean; backgroundColor?: string }): this;
  }
}
