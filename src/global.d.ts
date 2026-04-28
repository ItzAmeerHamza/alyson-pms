
interface Window {
  isElectron?: boolean;
  BroadcastChannel: typeof BroadcastChannel;
}

// Add DOM interface declarations
interface CustomEvent<T = any> extends Event {
  readonly detail: T;
  initCustomEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, detailArg: T): void;
}

interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean;
  passive?: boolean;
  signal?: AbortSignal;
}

interface DOMRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  toJSON(): any;
}

interface ResizeObserverEntry {
  readonly target: Element;
  readonly contentRect: DOMRectReadOnly;
  readonly borderBoxSize: ReadonlyArray<ResizeObserverSize>;
  readonly contentBoxSize: ReadonlyArray<ResizeObserverSize>;
  readonly devicePixelContentBoxSize?: ReadonlyArray<ResizeObserverSize>;
}

interface ResizeObserverSize {
  readonly inlineSize: number;
  readonly blockSize: number;
}

interface IntersectionObserverInit {
  root?: Element | Document | null;
  rootMargin?: string;
  threshold?: number | number[];
}

interface HTMLTableCaptionElement extends HTMLElement {}
interface HTMLMenuElement extends HTMLElement {}
interface HTMLPictureElement extends HTMLElement {}
interface HTMLTableCellElement extends HTMLElement {}
interface FileList {
  readonly length: number;
  item(index: number): File | null;
  [index: number]: File;
}

interface NodeListOf<TNode extends Node> {
  length: number;
  item(index: number): TNode;
  [index: number]: TNode;
  forEach(callbackfn: (value: TNode, key: number, parent: NodeListOf<TNode>) => void, thisArg?: any): void;
}

interface ParentNode {
  readonly children: HTMLCollection;
  readonly firstElementChild: Element | null;
  readonly lastElementChild: Element | null;
  readonly childElementCount: number;
}

interface CloseEvent extends Event {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

interface Worker extends EventTarget {
  onmessage: ((this: Worker, ev: MessageEvent) => any) | null;
  onerror: ((this: Worker, ev: ErrorEvent) => any) | null;
  postMessage(message: any, transfer: Transferable[]): void;
  postMessage(message: any, options?: PostMessageOptions): void;
  terminate(): void;
}

interface MediaQueryList extends EventTarget {
  readonly matches: boolean;
  readonly media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null;
  addListener(callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => any)): void;
  removeListener(callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => any)): void;
}

interface MutationRecord {
  readonly type: MutationRecordType;
  readonly target: Node;
  readonly addedNodes: NodeList;
  readonly removedNodes: NodeList;
  readonly previousSibling: Node | null;
  readonly nextSibling: Node | null;
  readonly attributeName: string | null;
  readonly attributeNamespace: string | null;
  readonly oldValue: string | null;
}

interface DocumentEventMap {
  [key: string]: Event;
}

interface HTMLElementTagNameMap {
  [key: string]: HTMLElement;
}

interface HTMLOptionsCollection {
  readonly length: number;
  readonly selectedIndex: number;
  [index: number]: HTMLOptionElement;
}

// Fix for RsaHashedImportParams and EcKeyImportParams
interface RsaHashedImportParams {
  name: string;
  hash: string | Algorithm;
}

interface EcKeyImportParams {
  name: string;
  namedCurve: string;
}

// Declare JSX namespace
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  // Add other JSX types that might be needed
  interface ElementAttributesProperty {
    props: {};
  }
  interface ElementChildrenAttribute {
    children: {};
  }
  type Element = import('react').ReactElement<any, any>;
}

// Export empty object to make this a module
export {};
