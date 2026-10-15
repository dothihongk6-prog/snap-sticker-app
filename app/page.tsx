"use client";

import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { 
  Camera, Image as ImageIcon, Trash2, Undo2, 
  Printer, Sparkles, Upload, Calendar,
  PenTool, Globe, Minus, Square, Circle, ArrowRight
} from "lucide-react";
import { removeBackground } from "@imgly/background-removal";
import jsPDF from "jspdf";

interface SavedSticker {
  id: string;
  url: string;
  assetId?: string;
}

type PlacedSticker = {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  borderColor?: string;
  borderWidth?: number;
  assetId?: string;
};

interface TextNote {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  align?: "left" | "center" | "right";
  rotation?: number;
}

interface JournalPage {
  id: string;
  journalTitle: string;
  titleFontSize?: number;
  titleColor?: string;
  titleBold?: boolean;
  journalDate: string;
  paperBackground: "lined" | "grid" | "kraft" | "white" | "custom";
  customPaperUrl: string | null;
  textNotes: TextNote[];
  placedStickers: PlacedSticker[];
  drawHistory: string[];
}

interface PrintSheetSticker {
  id: string;
  sourceId: string;
  label: string;
  url: string;
  assetId?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  aspectRatio: number;
  rotation: number;
  keepAspectRatio: boolean;
  outlineEnabled: boolean;
  outlineWidthMm: number;
}

interface PrintSheetPage {
  id: string;
  stickers: PrintSheetSticker[];
}

interface StickerSource {
  id: string;
  label: string;
  url: string;
  assetId?: string;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_MARGIN_MM = 8;
const A4_GAP_MM = 4;
const PRINT_DPI = 300;
const createPrintId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getPrintStickerBounds = (sticker: PrintSheetSticker) => {
  const outline = sticker.outlineEnabled ? sticker.outlineWidthMm * 2 : 0;
  const width = sticker.widthMm + outline;
  const height = sticker.heightMm + outline;
  const radians = (sticker.rotation * Math.PI) / 180;
  return {
    width: Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)),
    height: Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)),
  };
};

const stickerAssetDatabase = "snapsticker-assets-v1";
const stickerAssetStore = "assets";
const stickerAssetPrefix = "indexeddb:";

const openStickerAssetDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(stickerAssetDatabase, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(stickerAssetStore);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open sticker asset storage."));
  });

const saveStickerAsset = async (id: string, blob: Blob) => {
  const database = await openStickerAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(stickerAssetStore, "readwrite");
    transaction.objectStore(stickerAssetStore).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save sticker image."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Sticker image save was aborted."));
  }).finally(() => database.close());
};

const deleteStickerAsset = async (id: string) => {
  const database = await openStickerAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(stickerAssetStore, "readwrite");
    transaction.objectStore(stickerAssetStore).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to delete sticker image."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Sticker image deletion was aborted."));
  }).finally(() => database.close());
};

const loadStickerAsset = async (id: string) => {
  const database = await openStickerAssetDatabase();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const transaction = database.transaction(stickerAssetStore, "readonly");
    const request = transaction.objectStore(stickerAssetStore).get(id) as IDBRequest<Blob | undefined>;
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to load sticker image."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to load sticker image."));
    };
  });
};

const verifyStickerImage = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Sticker image failed to load."));
    image.src = url;
  });

const serializeSticker = <T extends { url: string; assetId?: string }>(sticker: T): T => ({
  ...sticker,
  url: sticker.assetId ? `${stickerAssetPrefix}${sticker.assetId}` : sticker.url,
});

const renderPrintableSticker = async (sticker: PrintSheetSticker) => {
  const image = new Image();
  image.src = sticker.url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Unable to load sticker "${sticker.label}" for PDF export.`));
  });

  const pixelsPerMm = PRINT_DPI / 25.4;
  const contentWidth = Math.max(1, Math.round(sticker.widthMm * pixelsPerMm));
  const contentHeight = Math.max(1, Math.round(sticker.heightMm * pixelsPerMm));
  const radius = sticker.outlineEnabled
    ? Math.max(0, Math.round(sticker.outlineWidthMm * pixelsPerMm))
    : 0;
  const contentCanvas = document.createElement("canvas");
  contentCanvas.width = contentWidth;
  contentCanvas.height = contentHeight;
  const contentContext = contentCanvas.getContext("2d");
  if (!contentContext) throw new Error("Unable to render sticker for PDF export.");
  contentContext.imageSmoothingQuality = "high";
  contentContext.drawImage(image, 0, 0, contentWidth, contentHeight);

  const stickerCanvas = document.createElement("canvas");
  stickerCanvas.width = contentWidth + radius * 2;
  stickerCanvas.height = contentHeight + radius * 2;
  if (radius > 0) {
    const source = document.createElement("canvas");
    source.width = stickerCanvas.width;
    source.height = stickerCanvas.height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("Unable to create sticker outline mask.");
    sourceContext.drawImage(contentCanvas, radius, radius);
    const sourceImage = sourceContext.getImageData(0, 0, source.width, source.height);
    const horizontal = new Uint8Array(source.width * source.height);
    const dilated = new Uint8Array(source.width * source.height);

    for (let y = 0; y < source.height; y += 1) {
      const deque = new Int32Array(source.width);
      let head = 0;
      let tail = 0;
      let next = 0;
      for (let x = 0; x < source.width; x += 1) {
        const right = Math.min(source.width - 1, x + radius);
        while (next <= right) {
          const alpha = sourceImage.data[(y * source.width + next) * 4 + 3];
          while (tail > head) {
            const previous = deque[tail - 1];
            if (sourceImage.data[(y * source.width + previous) * 4 + 3] > alpha) break;
            tail -= 1;
          }
          deque[tail++] = next++;
        }
        const left = x - radius;
        while (tail > head && deque[head] < left) head += 1;
        horizontal[y * source.width + x] =
          sourceImage.data[(y * source.width + deque[head]) * 4 + 3];
      }
    }

    for (let x = 0; x < source.width; x += 1) {
      const deque = new Int32Array(source.height);
      let head = 0;
      let tail = 0;
      let next = 0;
      for (let y = 0; y < source.height; y += 1) {
        const bottom = Math.min(source.height - 1, y + radius);
        while (next <= bottom) {
          const alpha = horizontal[next * source.width + x];
          while (tail > head && horizontal[deque[tail - 1] * source.width + x] <= alpha) {
            tail -= 1;
          }
          deque[tail++] = next++;
        }
        const top = y - radius;
        while (tail > head && deque[head] < top) head += 1;
        dilated[y * source.width + x] = horizontal[deque[head] * source.width + x];
      }
    }

    const outlineImage = sourceContext.createImageData(source.width, source.height);
    for (let i = 0; i < dilated.length; i += 1) {
      outlineImage.data[i * 4] = 255;
      outlineImage.data[i * 4 + 1] = 255;
      outlineImage.data[i * 4 + 2] = 255;
      outlineImage.data[i * 4 + 3] = dilated[i];
    }
    sourceContext.putImageData(outlineImage, 0, 0);

    const stickerContext = stickerCanvas.getContext("2d");
    if (!stickerContext) throw new Error("Unable to render sticker outline.");
    stickerContext.drawImage(source, 0, 0);
    stickerContext.drawImage(contentCanvas, radius, radius);
  } else {
    const stickerContext = stickerCanvas.getContext("2d");
    if (!stickerContext) throw new Error("Unable to render sticker for PDF export.");
    stickerContext.drawImage(contentCanvas, 0, 0);
  }

  const radians = (sticker.rotation * Math.PI) / 180;
  const rotatedWidth = Math.ceil(
    Math.abs(stickerCanvas.width * Math.cos(radians)) +
    Math.abs(stickerCanvas.height * Math.sin(radians))
  );
  const rotatedHeight = Math.ceil(
    Math.abs(stickerCanvas.width * Math.sin(radians)) +
    Math.abs(stickerCanvas.height * Math.cos(radians))
  );
  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = rotatedWidth;
  rotatedCanvas.height = rotatedHeight;
  const rotatedContext = rotatedCanvas.getContext("2d");
  if (!rotatedContext) throw new Error("Unable to rotate sticker for PDF export.");
  rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
  rotatedContext.rotate(radians);
  rotatedContext.drawImage(stickerCanvas, -stickerCanvas.width / 2, -stickerCanvas.height / 2);

  return {
    dataUrl: rotatedCanvas.toDataURL("image/png"),
    widthMm: rotatedCanvas.width / pixelsPerMm,
    heightMm: rotatedCanvas.height / pixelsPerMm,
  };
};

export default function DigitalJournalApp() {
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [borderWidth, setBorderWidth] = useState(3);

  const [fontSize, setFontSize] = useState(24);
  const [brushSize, setBrushSize] = useState(4);
  const [brushOpacity, setBrushOpacity] = useState(1);

  const [myStickers, setMyStickers] = useState<SavedSticker[]>([]);
  const [skipStickerDeleteConfirmation, setSkipStickerDeleteConfirmation] = useState(false);
  const [pendingStickerDeleteId, setPendingStickerDeleteId] = useState<string | null>(null);
  const [skipDeleteConfirmationForCurrentSticker, setSkipDeleteConfirmationForCurrentSticker] = useState(false);
  const stickerAssetUrlsRef = useRef(new Map<string, string>());
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [printSheets, setPrintSheets] = useState<PrintSheetPage[]>([
    { id: "print-sheet-1", stickers: [] },
  ]);
  const [isStickerSheetEditorOpen, setIsStickerSheetEditorOpen] = useState(false);
  const [activePrintSheetIndex, setActivePrintSheetIndex] = useState(0);
  const [selectedPrintStickerId, setSelectedPrintStickerId] = useState<string | null>(null);
  const [printCopyCount, setPrintCopyCount] = useState(1);
  const [printNotice, setPrintNotice] = useState("");
  const [printPreviewWidth, setPrintPreviewWidth] = useState(0);
  const printPreviewRef = useRef<HTMLDivElement>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  const [paperBackground, setPaperBackground] = useState<"lined" | "grid" | "kraft" | "white" | "custom">("lined");
  const [customPaperUrl, setCustomPaperUrl] = useState<string | null>(null);

  const [journalFont, setJournalFont] = useState<string>("font-sans");
  const [journalDate, setJournalDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [journalTitle, setJournalTitle] = useState("");
  const [titleFontSize, setTitleFontSize] = useState(18);
  const [titleColor, setTitleColor] = useState("#1e293b");
  const [titleBold, setTitleBold] = useState(true);
  const [textNotes, setTextNotes] = useState<TextNote[]>([]);

  const [activeTool, setActiveTool] = useState<"select" | "text" | "pen" | "eraser" | "shape">("select");
  const [selectedShape, setSelectedShape] = useState<"line" | "arrow" | "rect" | "circle">("rect");
  const [activeSheet, setActiveSheet] = useState<"tools" | "format" | "sticker" | "pages" | null>(null);
  const [drawHistory, setDrawHistory] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawHistoryRef = useRef<string[]>([]);
  const isDrawingRef = useRef(false);
  const isRestoringRef = useRef(false);
  const restoreGenerationRef = useRef(0);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const drawingPageIndexRef = useRef<number | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  const [pages, setPages] = useState<JournalPage[]>([
    {
      id: "page-1",
      journalTitle: "",
      titleFontSize: 18,
      titleColor: "#1e293b",
      titleBold: true,
      journalDate: new Date().toISOString().split("T")[0],
      paperBackground: "lined",
      customPaperUrl: null,
      textNotes: [],
      placedStickers: [],
      drawHistory: [],
    }
  ]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!isStickerSheetEditorOpen || !printPreviewRef.current) return;
    const element = printPreviewRef.current;
    const updateWidth = () => setPrintPreviewWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isStickerSheetEditorOpen]);

  useEffect(() => {
    if (!pendingStickerDeleteId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingStickerDeleteId(null);
        setSkipDeleteConfirmationForCurrentSticker(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pendingStickerDeleteId]);

  useEffect(() => {
    import("@imgly/background-removal");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hydrateSticker = async <T extends { id: string; url: string; assetId?: string }>(sticker: T): Promise<T> => {
      const assetId = sticker.assetId ?? (
        sticker.url.startsWith(stickerAssetPrefix)
          ? sticker.url.slice(stickerAssetPrefix.length)
          : undefined
      );

      if (assetId) {
        try {
          let url = stickerAssetUrlsRef.current.get(assetId);
          if (!url) {
            const blob = await loadStickerAsset(assetId);
            if (!blob) throw new Error(`Sticker image asset "${assetId}" was not found.`);
            url = URL.createObjectURL(blob);
            await verifyStickerImage(url);
            stickerAssetUrlsRef.current.set(assetId, url);
          }
          return { ...sticker, assetId, url };
        } catch (error) {
          console.error(`Failed to restore sticker image "${assetId}".`, error);
          return { ...sticker, assetId, url: "" };
        }
      }

      if (sticker.url.startsWith("data:")) {
        try {
          await verifyStickerImage(sticker.url);
          const response = await fetch(sticker.url);
          if (!response.ok) throw new Error("Unable to read the saved sticker image.");
          const blob = await response.blob();
          const migratedAssetId = `migrated-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await saveStickerAsset(migratedAssetId, blob);
          const url = URL.createObjectURL(blob);
          await verifyStickerImage(url);
          stickerAssetUrlsRef.current.set(migratedAssetId, url);
          return { ...sticker, assetId: migratedAssetId, url };
        } catch (error) {
          console.error(`Failed to migrate sticker image "${sticker.id}" to IndexedDB.`, error);
          return sticker;
        }
      }

      if (sticker.url.startsWith("blob:")) {
        console.error(
          `Cannot restore legacy sticker "${sticker.id}": its saved Blob URL was temporary and no image data was stored.`
        );
        return { ...sticker, url: "" };
      }

      if (!sticker.url) return sticker;

      try {
        await verifyStickerImage(sticker.url);
        return sticker;
      } catch (error) {
        console.error(`Failed to restore sticker image "${sticker.id}".`, error);
        return { ...sticker, url: "" };
      }
    };

    const restoreSavedData = async () => {
      const saved = window.localStorage.getItem("snapsticker-pages-v1");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as {
            pages?: JournalPage[];
            activePageIndex?: number;
            myStickers?: SavedSticker[];
            printSheets?: PrintSheetPage[];
            skipStickerDeleteConfirmation?: boolean;
          };
          setSkipStickerDeleteConfirmation(parsed.skipStickerDeleteConfirmation === true);

          if (parsed.pages && parsed.pages.length > 0) {
            const restoredPages = await Promise.all(
              parsed.pages.map(async (page) => ({
                ...page,
                placedStickers: await Promise.all(
                  (page.placedStickers || []).map(hydrateSticker)
                ),
              }))
            );
            const restoredLibrary = await Promise.all(
              (parsed.myStickers || []).map(hydrateSticker)
            );
            const restoredPrintSheets = await Promise.all(
              (parsed.printSheets || [{ id: "print-sheet-1", stickers: [] }]).map(async (sheet) => ({
                ...sheet,
                stickers: await Promise.all((sheet.stickers || []).map(hydrateSticker)),
              }))
            );

            setPages(restoredPages);
            setMyStickers(restoredLibrary);
            setPrintSheets(restoredPrintSheets);
            const nextIndex = Math.min(parsed.activePageIndex ?? 0, restoredPages.length - 1);
            setActivePageIndex(nextIndex);
            const loadedPage = restoredPages[nextIndex];
            setJournalTitle(loadedPage.journalTitle || "");
            setTitleFontSize(loadedPage.titleFontSize ?? 18);
            setTitleColor(loadedPage.titleColor ?? "#1e293b");
            setTitleBold(loadedPage.titleBold ?? true);
            setJournalDate(loadedPage.journalDate || new Date().toISOString().split("T")[0]);
            setPaperBackground(loadedPage.paperBackground || "lined");
            setCustomPaperUrl(loadedPage.customPaperUrl || null);
            setTextNotes(loadedPage.textNotes || []);
            setPlacedStickers(loadedPage.placedStickers || []);
            drawHistoryRef.current = loadedPage.drawHistory || [];
            setDrawHistory(loadedPage.drawHistory || []);
          } else {
            setMyStickers(await Promise.all((parsed.myStickers || []).map(hydrateSticker)));
            setPrintSheets(await Promise.all(
              (parsed.printSheets || [{ id: "print-sheet-1", stickers: [] }]).map(async (sheet) => ({
                ...sheet,
                stickers: await Promise.all((sheet.stickers || []).map(hydrateSticker)),
              }))
            ));
          }
        } catch (error) {
          console.error("Failed to restore SnapSticker data.", error);
        }
      }

      setIsHydrated(true);
    };

    void restoreSavedData();
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        "snapsticker-pages-v1",
        JSON.stringify({
          pages: pages.map((page) => ({
            ...page,
            placedStickers: page.placedStickers.map(serializeSticker),
          })),
          activePageIndex,
          myStickers: myStickers.map(serializeSticker),
          printSheets: printSheets.map((sheet) => ({
            ...sheet,
            stickers: sheet.stickers.map(serializeSticker),
          })),
          skipStickerDeleteConfirmation,
        })
      );
    } catch (error) {
      console.error(
        "Failed to save SnapSticker data to LocalStorage. Sticker images are stored separately in IndexedDB.",
        error
      );
    }
  }, [pages, activePageIndex, myStickers, printSheets, skipStickerDeleteConfirmation, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    const activeDrawHistory = drawHistory;
    setPages((prev) =>
      prev.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              journalTitle,
              titleFontSize,
              titleColor,
              titleBold,
              journalDate,
              paperBackground,
              customPaperUrl,
              textNotes,
              placedStickers,
              drawHistory: activeDrawHistory,
            }
          : page
      )
    );
  }, [activePageIndex, journalTitle, titleFontSize, titleColor, titleBold, journalDate, paperBackground, customPaperUrl, textNotes, placedStickers, drawHistory, isHydrated]);

  const loadPageData = (page: JournalPage) => {
    restoreGenerationRef.current += 1;
    isRestoringRef.current = true;
    isDrawingRef.current = false;
    startPosRef.current = null;
    lastPosRef.current = null;
    drawingPageIndexRef.current = null;
    setJournalTitle(page.journalTitle || "");
    setTitleFontSize(page.titleFontSize ?? 18);
    setTitleColor(page.titleColor ?? "#1e293b");
    setTitleBold(page.titleBold ?? true);
    setJournalDate(page.journalDate || new Date().toISOString().split("T")[0]);
    setPaperBackground(page.paperBackground || "lined");
    setCustomPaperUrl(page.customPaperUrl || null);
    setTextNotes(page.textNotes || []);
    setPlacedStickers(page.placedStickers || []);
    drawHistoryRef.current = page.drawHistory || [];
    setDrawHistory(page.drawHistory || []);
    setSelectedStickerId(null);
    setSelectedTextId(null);
    restoreDrawState(drawHistoryRef.current[drawHistoryRef.current.length - 1]);
  };

  const syncCurrentPageState = () => {
    const activeDrawHistory = drawHistoryRef.current;
    setPages((prev) =>
      prev.map((page, index) =>
        index === activePageIndex
          ? {
              ...page,
              journalTitle,
              titleFontSize,
              titleColor,
              titleBold,
              journalDate,
              paperBackground,
              customPaperUrl,
              textNotes,
              placedStickers,
              drawHistory: activeDrawHistory,
            }
          : page
      )
    );
  };

  const goToPage = (index: number) => {
    if (index < 0 || index >= pages.length) return;

    syncCurrentPageState();

    const targetPage = pages[index];
    loadPageData(targetPage);
    setActivePageIndex(index);
  };

  const addPage = () => {
    syncCurrentPageState();

    const newPage: JournalPage = {
      id: `page-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      journalTitle: "",
      titleFontSize: 18,
      titleColor: "#1e293b",
      titleBold: true,
      journalDate: new Date().toISOString().split("T")[0],
      paperBackground: "lined",
      customPaperUrl: null,
      textNotes: [],
      placedStickers: [],
      drawHistory: [],
    };

    const nextIndex = pages.length;
    setPages((prev) => [...prev, newPage]);
    setActivePageIndex(nextIndex);
    loadPageData(newPage);
  };

  const deleteCurrentPage = () => {
    if (pages.length <= 1) return;

    syncCurrentPageState();

    const filteredPages = pages.filter((_, index) => index !== activePageIndex);
    const nextIndex = activePageIndex > 0 ? activePageIndex - 1 : 0;

    setPages(filteredPages);
    setActivePageIndex(nextIndex);
    loadPageData(filteredPages[nextIndex]);
  };

  const handleColorChange = (newColor: string) => {
    setActiveColor(newColor);
    if (selectedStickerId) {
      setPlacedStickers((prev) =>
        prev.map((s) => (s.id === selectedStickerId ? { ...s, borderColor: newColor } : s))
      );
    }
  };

  const handleBorderWidthChange = (width: number) => {
    setBorderWidth(width);
    if (selectedStickerId) {
      setPlacedStickers((prev) =>
        prev.map((s) => (s.id === selectedStickerId ? { ...s, borderWidth: width } : s))
      );
    }
  };

  const handleJournalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).closest('.react-draggable')) {
      return;
    }
    setSelectedStickerId(null);
    setSelectedTextId(null);
    if (activeTool !== "text") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newNote: TextNote = {
      id: Date.now().toString(),
      text: "",
      x: Math.max(10, x - 20),
      y: Math.max(10, y - 15),
      fontSize: fontSize,
      color: activeColor === "#ffffff" ? "#1e293b" : activeColor,
      fontFamily: journalFont,
      align: "left",
      rotation: 0,
    };
    setTextNotes((prev) => [...prev, newNote]);
    setSelectedTextId(newNote.id);
  };

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 40, y: 40, width: 220, height: 220 });

  useEffect(() => {
    const initGoogleTranslate = () => {
      const container = document.getElementById("google_translate_element");
      if (!container || container.querySelector(".goog-te-combo")) return;

      const existingScript = document.getElementById("google-translate-script");

      (window as any).googleTranslateElementInit = () => {
        const target = document.getElementById("google_translate_element");
        if (!target || target.querySelector(".goog-te-combo")) return;

        if ((window as any).google?.translate) {
          new (window as any).google.translate.TranslateElement(
            { pageLanguage: "vi", layout: (window as any).google.translate.TranslateElement.InlineLayout.HORIZONTAL },
            "google_translate_element"
          );
        }
      };

      if ((window as any).google?.translate) {
        new (window as any).google.translate.TranslateElement(
          { pageLanguage: "vi", layout: (window as any).google.translate.TranslateElement.InlineLayout.HORIZONTAL },
          "google_translate_element"
        );
        return;
      }

      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "google-translate-script";
        script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
        script.async = true;
        document.body.appendChild(script);
      }
    };

    initGoogleTranslate();
  }, []);

  const journalRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const restoreDrawState = (snapshot: string | undefined) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const generation = ++restoreGenerationRef.current;
    if (!snapshot) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isRestoringRef.current = false;
      return;
    }

    isRestoringRef.current = true;
    const img = new Image();
    img.onload = () => {
      if (generation !== restoreGenerationRef.current || canvasRef.current !== canvas) return;

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      isRestoringRef.current = false;
    };
    img.onerror = (error) => {
      if (generation !== restoreGenerationRef.current) return;
      isRestoringRef.current = false;
      console.error("Failed to restore the Canvas drawing history.", error);
    };
    img.src = snapshot;
  };

  useEffect(() => {
    if (!isHydrated) return;

    restoreDrawState(drawHistoryRef.current[drawHistoryRef.current.length - 1]);
  }, [isHydrated]);

  const processAndSaveStickerAI = async (imageDataUrl: string) => {
    setIsProcessingAI(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.src = imageDataUrl;
        img.onload = () => {
          const MAX_SIZE = 640;
          let w = img.width, h = img.height;
          if (w > MAX_SIZE || h > MAX_SIZE) {
            if (w > h) { h = Math.round((h * MAX_SIZE) / w); w = MAX_SIZE; }
            else { w = Math.round((w * MAX_SIZE) / h); h = MAX_SIZE; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, w, h);
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error("Unable to encode sticker image."));
          }, "image/png", 0.8);
        };
        img.onerror = () => reject(new Error("Unable to load the source sticker image."));
      });

      let stickerBlob: Blob;
      try {
        stickerBlob = await removeBackground(blob, { model: "isnet_quint8" });
      } catch (error) {
        console.error("Background removal failed; saving the original sticker image instead.", error);
        stickerBlob = await (await fetch(imageDataUrl)).blob();
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveStickerAsset(id, stickerBlob);
      const url = URL.createObjectURL(stickerBlob);
      await verifyStickerImage(url);
      stickerAssetUrlsRef.current.set(id, url);
      setMyStickers((prev) => [{ id, assetId: id, url }, ...prev]);
    } catch (error) {
      console.error("Failed to save the sticker image.", error);
      alert("Không thể lưu sticker. Vui lòng kiểm tra dung lượng lưu trữ của trình duyệt.");
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) await processAndSaveStickerAI(event.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCustomPaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCustomPaperUrl(event.target.result as string);
          setPaperBackground("custom");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      alert("Không thể mở Camera!");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    setIsCameraOpen(false);
  };

  const captureCameraSticker = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = cropBox.width * 2;
    tempCanvas.height = cropBox.height * 2;
    const ctx = tempCanvas.getContext("2d");
    if (ctx) ctx.drawImage(video, cropBox.x, cropBox.y, cropBox.width, cropBox.height, 0, 0, tempCanvas.width, tempCanvas.height);
    stopCamera();
    await processAndSaveStickerAI(tempCanvas.toDataURL("image/png"));
  };

  const placeStickerToJournal = (url: string, assetId?: string) => {
    const newSticker: PlacedSticker = {
      id: Date.now().toString(),
      url: url,
      assetId,
      x: 60,
      y: 60,
      width: 130,
      height: 130,
      rotation: 0,
      borderColor: activeColor,
      borderWidth: borderWidth,
    };
    setPlacedStickers((prev) => [...prev, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  const deleteStickerFromLibrary = (stickerId: string) => {
    const sticker = myStickers.find((item) => item.id === stickerId);
    if (sticker?.assetId) {
      const usedOnCurrentPage = placedStickers.some((item) => item.assetId === sticker.assetId);
      const usedOnAnotherPage = pages.some(
        (page, index) =>
          index !== activePageIndex &&
          page.placedStickers.some((item) => item.assetId === sticker.assetId)
      );
      const stillInLibrary = myStickers.some(
        (item) => item.id !== stickerId && item.assetId === sticker.assetId
      );
      const usedOnPrintSheet = printSheets.some((sheet) =>
        sheet.stickers.some((item) => item.assetId === sticker.assetId)
      );

      if (!usedOnCurrentPage && !usedOnAnotherPage && !stillInLibrary && !usedOnPrintSheet) {
        const url = stickerAssetUrlsRef.current.get(sticker.assetId);
        if (url) URL.revokeObjectURL(url);
        stickerAssetUrlsRef.current.delete(sticker.assetId);
        void deleteStickerAsset(sticker.assetId).catch((error) => {
          console.error(`Failed to delete unused sticker image "${sticker.assetId}".`, error);
        });
      }
    }
    setMyStickers((prev) => prev.filter((item) => item.id !== stickerId));
  };

  const requestStickerLibraryRemoval = (stickerId: string) => {
    if (skipStickerDeleteConfirmation) {
      deleteStickerFromLibrary(stickerId);
      return;
    }
    setSkipDeleteConfirmationForCurrentSticker(false);
    setPendingStickerDeleteId(stickerId);
  };

  const confirmStickerLibraryRemoval = () => {
    if (!pendingStickerDeleteId) return;
    if (skipDeleteConfirmationForCurrentSticker) {
      setSkipStickerDeleteConfirmation(true);
    }
    deleteStickerFromLibrary(pendingStickerDeleteId);
    setPendingStickerDeleteId(null);
    setSkipDeleteConfirmationForCurrentSticker(false);
  };

  const cancelStickerLibraryRemoval = () => {
    setPendingStickerDeleteId(null);
    setSkipDeleteConfirmationForCurrentSticker(false);
  };

  const selectedRotation =
    selectedStickerId !== null
      ? placedStickers.find((sticker) => sticker.id === selectedStickerId)?.rotation ?? 0
      : selectedTextId !== null
      ? textNotes.find((note) => note.id === selectedTextId)?.rotation ?? 0
      : 0;

  const updateSelectedItemRotation = (nextRotation: number) => {
    if (selectedStickerId) {
      setPlacedStickers((prev) =>
        prev.map((sticker) =>
          sticker.id === selectedStickerId ? { ...sticker, rotation: nextRotation } : sticker
        )
      );
      return;
    }

    if (selectedTextId) {
      setTextNotes((prev) =>
        prev.map((note) =>
          note.id === selectedTextId ? { ...note, rotation: nextRotation } : note
        )
      );
    }
  };

  const rotateSelectedItem = (delta: number) => {
    updateSelectedItemRotation((selectedRotation + delta + 360) % 360);
  };

  const handleRotateStart = (
    e: React.PointerEvent<HTMLButtonElement>,
    itemId: string,
    itemType: "sticker" | "text"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const element = document.getElementById(`${itemType}-${itemId}`);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMove = (moveEvent: PointerEvent | MouseEvent | TouchEvent) => {
      let clientX = 0, clientY = 0;

      if ("pointerType" in moveEvent && moveEvent.pointerType) {
        clientX = moveEvent.clientX;
        clientY = moveEvent.clientY;
      } else if ("touches" in moveEvent && moveEvent.touches.length > 0) {
        clientX = moveEvent.touches[0].clientX;
        clientY = moveEvent.touches[0].clientY;
      } else if ("clientX" in moveEvent) {
        clientX = moveEvent.clientX;
        clientY = moveEvent.clientY;
      }

      const radians = Math.atan2(clientY - centerY, clientX - centerX);
      let degrees = radians * (180 / Math.PI) + 90;
      if (degrees < 0) degrees += 360;

      if (itemType === "sticker") {
        setPlacedStickers((prev) =>
          prev.map((s) => (s.id === itemId ? { ...s, rotation: Math.round(degrees) } : s))
        );
      } else {
        setTextNotes((prev) =>
          prev.map((n) => (n.id === itemId ? { ...n, rotation: Math.round(degrees) } : n))
        );
      }
    };

    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleEnd);
  };

  const getCanvasPoint = (
    event: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const saveDrawState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const snapshot = canvas.toDataURL("image/png");
      const nextHistory = [...drawHistoryRef.current, snapshot];
      drawHistoryRef.current = nextHistory;
      setDrawHistory(nextHistory);
    }
  };

  const undoDraw = () => {
    if (isDrawingRef.current || drawHistoryRef.current.length === 0) return;

    const nextHistory = drawHistoryRef.current.slice(0, -1);
    drawHistoryRef.current = nextHistory;
    setDrawHistory(nextHistory);
    restoreDrawState(nextHistory[nextHistory.length - 1]);
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      (activeTool !== "pen" && activeTool !== "eraser" && activeTool !== "shape") ||
      isRestoringRef.current
    ) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getCanvasPoint(e, canvas);
    const ctx = canvas.getContext("2d");
    if (!point || !ctx) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    restoreGenerationRef.current += 1;
    isDrawingRef.current = true;
    drawingPageIndexRef.current = activePageIndex;
    startPosRef.current = point;
    lastPosRef.current = point;
    snapshotRef.current = activeTool === "shape"
      ? ctx.getImageData(0, 0, canvas.width, canvas.height)
      : null;

    if (activeTool === "pen" || activeTool === "eraser") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = brushOpacity;
      ctx.globalCompositeOperation = activeTool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = activeColor;
      ctx.lineWidth = activeTool === "eraser" ? brushSize * 4 : brushSize;
      ctx.beginPath();
      ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || drawingPageIndexRef.current !== activePageIndex) return;

    const canvas = canvasRef.current;
    const startPos = startPosRef.current;
    const lastPos = lastPosRef.current;
    const point = canvas && getCanvasPoint(e, canvas);
    const ctx = canvas?.getContext("2d");
    if (!canvas || !startPos || !lastPos || !point || !ctx) return;

    if (activeTool === "pen" || activeTool === "eraser") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = brushOpacity;
      ctx.globalCompositeOperation = activeTool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = activeTool === "eraser" ? brushSize * 4 : brushSize;
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPosRef.current = point;
    } else if (activeTool === "shape" && snapshotRef.current) {
      ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = brushSize;
      ctx.globalAlpha = brushOpacity;
      ctx.beginPath();

      if (selectedShape === "rect") {
        ctx.strokeRect(startPos.x, startPos.y, point.x - startPos.x, point.y - startPos.y);
      } else if (selectedShape === "circle") {
        const radius = Math.hypot(point.x - startPos.x, point.y - startPos.y);
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (selectedShape === "line") {
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      } else if (selectedShape === "arrow") {
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        const angle = Math.atan2(point.y - startPos.y, point.x - startPos.x);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x - 12 * Math.cos(angle - Math.PI / 6), point.y - 12 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(point.x - 12 * Math.cos(angle + Math.PI / 6), point.y - 12 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = activeColor;
        ctx.fill();
      }
    }
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    draw(e);
    const shouldSave = drawingPageIndexRef.current === activePageIndex;
    isDrawingRef.current = false;
    startPosRef.current = null;
    lastPosRef.current = null;
    drawingPageIndexRef.current = null;
    snapshotRef.current = null;

    if (shouldSave) saveDrawState();
  };

  const getPrintSources = (): StickerSource[] => [
    ...pages.flatMap((page, pageIndex) =>
      page.placedStickers
        .filter((sticker) => sticker.url)
        .map((sticker, index) => ({
          id: `page-${pageIndex}-${sticker.id}`,
          label: `Page ${pageIndex + 1} Sticker ${index + 1}`,
          url: sticker.url,
          assetId: sticker.assetId,
        }))
    ),
    ...myStickers
      .filter((sticker) => sticker.url)
      .map((sticker, index) => ({
        id: `library-${sticker.id}`,
        label: `Library Sticker ${index + 1}`,
        url: sticker.url,
        assetId: sticker.assetId,
      })),
  ];

  const layoutPrintStickers = (stickers: PrintSheetSticker[]) => {
    const usableWidth = A4_WIDTH_MM - A4_MARGIN_MM * 2;
    const usableHeight = A4_HEIGHT_MM - A4_MARGIN_MM * 2;
    const pages: PrintSheetPage[] = [];
    let page: PrintSheetPage = { id: createPrintId("print-sheet"), stickers: [] };
    let x = A4_MARGIN_MM;
    let y = A4_MARGIN_MM;
    let rowHeight = 0;
    const oversized: PrintSheetSticker[] = [];

    for (const sticker of stickers) {
      const { width, height } = getPrintStickerBounds(sticker);
      if (width > usableWidth || height > usableHeight) {
        oversized.push(sticker);
        continue;
      }

      if (x + width > A4_WIDTH_MM - A4_MARGIN_MM) {
        x = A4_MARGIN_MM;
        y += rowHeight + A4_GAP_MM;
        rowHeight = 0;
      }
      if (y + height > A4_HEIGHT_MM - A4_MARGIN_MM) {
        if (page.stickers.length > 0) pages.push(page);
        page = { id: createPrintId(`print-sheet-${pages.length + 1}`), stickers: [] };
        x = A4_MARGIN_MM;
        y = A4_MARGIN_MM;
        rowHeight = 0;
      }
      page.stickers.push({
        ...sticker,
        xMm: x + (width - sticker.widthMm) / 2,
        yMm: y + (height - sticker.heightMm) / 2,
      });
      x += width + A4_GAP_MM;
      rowHeight = Math.max(rowHeight, height);
    }

    if (page.stickers.length > 0 || pages.length === 0) pages.push(page);
    return { pages, oversized };
  };

  const placePrintStickerCopies = (
    currentSheets: PrintSheetPage[],
    stickersToPlace: PrintSheetSticker[]
  ): { pages: PrintSheetPage[]; oversized: PrintSheetSticker[] } => {
    const pages = currentSheets.map((sheet) => ({ ...sheet, stickers: [...sheet.stickers] }));
    if (pages.length === 0) pages.push({ id: createPrintId("print-sheet"), stickers: [] });
    const oversized: PrintSheetSticker[] = [];
    const usableWidth = A4_WIDTH_MM - A4_MARGIN_MM * 2;
    const usableHeight = A4_HEIGHT_MM - A4_MARGIN_MM * 2;

    for (const sticker of stickersToPlace) {
      const bounds = getPrintStickerBounds(sticker);
      if (bounds.width > usableWidth || bounds.height > usableHeight) {
        oversized.push(sticker);
        continue;
      }

      let placed = false;
      for (const sheet of pages) {
        let position: { x: number; y: number } | null = null;
        for (
          let y = A4_MARGIN_MM;
          y + bounds.height <= A4_HEIGHT_MM - A4_MARGIN_MM && !position;
          y += A4_GAP_MM
        ) {
          for (
            let x = A4_MARGIN_MM;
            x + bounds.width <= A4_WIDTH_MM - A4_MARGIN_MM;
            x += A4_GAP_MM
          ) {
            const overlaps = sheet.stickers.some((existing) => {
              const existingBounds = getPrintStickerBounds(existing);
              const existingLeft = existing.xMm + (existingBounds.width - existing.widthMm) / 2;
              const existingTop = existing.yMm + (existingBounds.height - existing.heightMm) / 2;
              return (
                x < existingLeft + existingBounds.width + A4_GAP_MM &&
                x + bounds.width + A4_GAP_MM > existingLeft &&
                y < existingTop + existingBounds.height + A4_GAP_MM &&
                y + bounds.height + A4_GAP_MM > existingTop
              );
            });
            if (!overlaps) {
              position = { x, y };
              break;
            }
          }
        }
        if (position) {
          sheet.stickers.push({
            ...sticker,
            xMm: position.x + (bounds.width - sticker.widthMm) / 2,
            yMm: position.y + (bounds.height - sticker.heightMm) / 2,
          });
          placed = true;
          break;
        }
      }

      if (!placed) {
        const sheet: PrintSheetPage = { id: createPrintId("print-sheet"), stickers: [] };
        sheet.stickers.push({
          ...sticker,
          xMm: A4_MARGIN_MM + (bounds.width - sticker.widthMm) / 2,
          yMm: A4_MARGIN_MM + (bounds.height - sticker.heightMm) / 2,
        });
        pages.push(sheet);
      }
    }
    return { pages, oversized };
  };

  const addPrintStickerCopies = async (source: StickerSource) => {
    const count = Math.max(1, Math.min(100, Math.floor(printCopyCount)));
    const image = new Image();
    image.src = source.url;
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Unable to load ${source.label}.`));
      });
    } catch (error) {
      console.error(`Failed to load print source "${source.id}".`, error);
      setPrintNotice(error instanceof Error ? error.message : "Unable to load this sticker.");
      return;
    }
    const copies: PrintSheetSticker[] = Array.from({ length: count }, (_, index) => ({
      id: createPrintId(`print-${index}`),
      sourceId: source.id,
      label: source.label,
      url: source.url,
      assetId: source.assetId,
      xMm: A4_MARGIN_MM,
      yMm: A4_MARGIN_MM,
      widthMm: 35,
      heightMm: 35 / (image.naturalWidth / image.naturalHeight),
      aspectRatio: image.naturalWidth / image.naturalHeight,
      rotation: 0,
      keepAspectRatio: true,
      outlineEnabled: true,
      outlineWidthMm: 1,
    }));
    const result = placePrintStickerCopies(printSheets, copies);
    if (result.oversized.length > 0) {
      setPrintNotice("A sticker is larger than the printable A4 area. Reduce its size before adding more copies.");
      return;
    }
    setPrintSheets(result.pages);
    setActivePrintSheetIndex(Math.max(0, result.pages.findIndex((sheet) =>
      sheet.stickers.some((sticker) => sticker.id === copies[0]?.id)
    )));
    setSelectedPrintStickerId(copies[0]?.id ?? null);
    setPrintNotice(`Added ${copies.length} independent copy/copies.`);
  };

  const updateSelectedPrintSticker = (patch: Partial<PrintSheetSticker>) => {
    setPrintSheets((previous) => previous.map((sheet, sheetIndex) => ({
      ...sheet,
      stickers: sheet.stickers.map((sticker) =>
        sheetIndex === activePrintSheetIndex && sticker.id === selectedPrintStickerId
          ? { ...sticker, ...patch }
          : sticker
      ),
    })));
  };

  const clampPrintStickerPosition = (
    sticker: PrintSheetSticker,
    widthMm: number,
    heightMm: number,
    xMm: number,
    yMm: number
  ) => {
    const bounds = getPrintStickerBounds({ ...sticker, widthMm, heightMm });
    const offsetX = (bounds.width - widthMm) / 2;
    const offsetY = (bounds.height - heightMm) / 2;
    const minX = A4_MARGIN_MM + offsetX;
    const minY = A4_MARGIN_MM + offsetY;
    const maxX = Math.max(minX, A4_WIDTH_MM - A4_MARGIN_MM - bounds.width + offsetX);
    const maxY = Math.max(minY, A4_HEIGHT_MM - A4_MARGIN_MM - bounds.height + offsetY);
    return {
      xMm: Math.max(minX, Math.min(maxX, xMm)),
      yMm: Math.max(minY, Math.min(maxY, yMm)),
    };
  };

  const duplicatePrintSticker = () => {
    const selected = printSheets[activePrintSheetIndex]?.stickers.find(
      (sticker) => sticker.id === selectedPrintStickerId
    );
    if (!selected) return;
    const copy = {
      ...selected,
      id: createPrintId("print"),
      xMm: selected.xMm + A4_GAP_MM,
    };
    const result = placePrintStickerCopies(printSheets, [copy]);
    if (result.oversized.length > 0) {
      setPrintNotice("A sticker is larger than the printable A4 area. Reduce its size before duplicating.");
      return;
    }
    setPrintSheets(result.pages);
    setActivePrintSheetIndex(Math.max(0, result.pages.findIndex((sheet) =>
      sheet.stickers.some((sticker) => sticker.id === copy.id)
    )));
    setSelectedPrintStickerId(copy.id);
    setPrintNotice("Sticker duplicated as an independent print copy.");
  };

  const removeSelectedPrintSticker = () => {
    const updated = printSheets.map((sheet) => ({
      ...sheet,
      stickers: sheet.stickers.filter((sticker) => sticker.id !== selectedPrintStickerId),
    }));
    setPrintSheets(updated.length ? updated : [{ id: createPrintId("print-sheet"), stickers: [] }]);
    setSelectedPrintStickerId(null);
  };

  const addPrintSheet = () => {
    const newSheet = { id: createPrintId("print-sheet"), stickers: [] };
    setPrintSheets((previous) => [...previous, newSheet]);
    setActivePrintSheetIndex(printSheets.length);
    setSelectedPrintStickerId(null);
  };

  const autoArrangePrintSheets = () => {
    const result = layoutPrintStickers(printSheets.flatMap((sheet) => sheet.stickers));
    if (result.oversized.length > 0) {
      setPrintNotice(
        `${result.oversized.length} sticker(s) exceed the printable A4 area. Existing layout was preserved; reduce their size and retry.`
      );
      return;
    }
    setPrintSheets(result.pages);
    setActivePrintSheetIndex(0);
    setPrintNotice(`Arranged stickers across ${result.pages.length} A4 sheet(s).`);
  };

  const exportPrintSheets = async (printAfterExport = false) => {
    const printWindow = printAfterExport ? window.open("about:blank", "_blank") : null;
    if (printAfterExport && !printWindow) {
      setPrintNotice("Your browser blocked the print window. Allow pop-ups or export the PDF instead.");
      return;
    }
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const printableSheets = printSheets.length ? printSheets : [{ id: "print-sheet-1", stickers: [] }];
      for (let sheetIndex = 0; sheetIndex < printableSheets.length; sheetIndex += 1) {
        if (sheetIndex > 0) pdf.addPage("a4", "p");
        for (const sticker of printableSheets[sheetIndex].stickers) {
          const rendered = await renderPrintableSticker(sticker);
          pdf.addImage(
            rendered.dataUrl,
            "PNG",
            sticker.xMm + sticker.widthMm / 2 - rendered.widthMm / 2,
            sticker.yMm + sticker.heightMm / 2 - rendered.heightMm / 2,
            rendered.widthMm,
            rendered.heightMm
          );
        }
      }
      if (printAfterExport && printWindow) {
        pdf.autoPrint();
        printWindow.location.href = pdf.output("bloburl").toString();
      } else {
        pdf.save("snapsticker-A4-sheets.pdf");
      }
    } catch (error) {
      printWindow?.close();
      console.error("Failed to export A4 sticker sheets.", error);
      setPrintNotice(error instanceof Error ? error.message : "Unable to export the A4 sticker sheets.");
    }
  };

  const activePrintSheet = printSheets[activePrintSheetIndex] ?? {
    id: "print-sheet-preview",
    stickers: [],
  };
  const selectedPrintSticker = activePrintSheet.stickers.find(
    (sticker) => sticker.id === selectedPrintStickerId
  );
  const printPreviewScale = printPreviewWidth / A4_WIDTH_MM;
  const printSources = getPrintSources();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-3 sm:p-6 font-sans">
      <style>{`
        .bg-lined { background-color: #fdfbf7; background-image: repeating-linear-gradient(transparent, transparent 27px, #e2e8f0 28px); }
        .bg-grid { background-color: #fdfbf7; background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px); background-size: 24px 24px; }
        .bg-kraft { background-color: #f5efe6; }
        .bg-white-paper { background-color: #ffffff; }
        
        #google_translate_element {
          display: flex;
          align-items: center;
        }
        #google_translate_element select {
          background-color: #1e293b !important;
          color: #f472b6 !important;
          border: 1px solid #475569 !important;
          border-radius: 8px !important;
          padding: 4px 8px !important;
          font-size: 12px !important;
          outline: none !important;
          cursor: pointer !important;
          min-width: 160px !important;
        }
        #google_translate_element .goog-te-gadget {
          color: transparent !important;
          font-size: 0 !important;
        }
        #google_translate_element .goog-te-gadget .goog-te-combo {
          color: #f472b6 !important;
          font-size: 12px !important;
          display: block !important;
        }
        #google_translate_element .goog-te-gadget span,
        #google_translate_element .goog-te-gadget img,
        #google_translate_element .goog-te-branding,
        #google_translate_element .goog-logo-link,
        #google_translate_element .goog-te-branding-link {
          display: none !important;
        }
      `}</style>

      {/* HEADER */}
      <header className="w-full max-w-6xl flex flex-wrap items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-4 gap-3">
        <h1 className="text-xl font-bold text-pink-500 flex items-center gap-2">📖 Nhật Ký Sticker & Note Số</h1>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700 min-w-[170px] justify-center">
            <Globe className="w-4 h-4 text-pink-400 shrink-0" />
            <div id="google_translate_element" className="w-full"></div>
          </div>
          <button onClick={() => setIsStickerSheetEditorOpen(true)} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center gap-1.5"><Printer className="w-4 h-4" /> In A4</button>
        </div>
      </header>

      <div className="w-full max-w-6xl relative mb-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/95 p-2 shadow-xl backdrop-blur-md">
          <button
            onClick={() => setActiveSheet((prev) => (prev === "tools" ? null : "tools"))}
            className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition-all ${activeSheet === "tools" ? "bg-pink-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            ✏️ Công cụ
          </button>
          <button
            onClick={() => setActiveSheet((prev) => (prev === "format" ? null : "format"))}
            className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition-all ${activeSheet === "format" ? "bg-pink-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            🎨 Định dạng
          </button>
          <button
            onClick={() => setActiveSheet((prev) => (prev === "sticker" ? null : "sticker"))}
            className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition-all ${activeSheet === "sticker" ? "bg-pink-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            🖼 Sticker
          </button>
          <button
            onClick={() => setActiveSheet((prev) => (prev === "pages" ? null : "pages"))}
            className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition-all ${activeSheet === "pages" ? "bg-pink-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
          >
            📖 Trang sổ
          </button>
          <button
            onClick={undoDraw}
            className="ml-auto rounded-xl bg-slate-800 px-3 py-2 text-[11px] font-semibold text-slate-200 transition-all hover:bg-slate-700"
          >
            Hoàn tác
          </button>
        </div>

        {activeSheet && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setActiveSheet(null)} />
            <div
              className="absolute left-0 top-full z-40 mt-2 w-[min(360px,calc(100vw-2rem))] max-h-[75vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-pink-400">
                  {activeSheet === "tools" && "Công cụ"}
                  {activeSheet === "sticker" && "Sticker"}
                  {activeSheet === "format" && "Định dạng"}
                  {activeSheet === "pages" && "Trang sổ"}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300"
                >
                  ✕
                </button>
              </div>

              {activeSheet === "tools" && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setActiveTool("select"); setActiveSheet(null); }}
                    className={`rounded-2xl border px-3 py-3 text-left ${activeTool === "select" ? "border-pink-500 bg-pink-500/10 text-pink-300" : "border-slate-700 bg-slate-950/50 text-slate-200"}`}
                  >
                    <div className="text-base">↖</div>
                    <div className="mt-1 text-xs font-semibold">Con trỏ</div>
                  </button>
                  <button
                    onClick={() => { setActiveTool("text"); setActiveSheet(null); }}
                    className={`rounded-2xl border px-3 py-3 text-left ${activeTool === "text" ? "border-pink-500 bg-pink-500/10 text-pink-300" : "border-slate-700 bg-slate-950/50 text-slate-200"}`}
                  >
                    <div className="text-base">✍️</div>
                    <div className="mt-1 text-xs font-semibold">Văn bản</div>
                  </button>
                  <button
                    onClick={() => { setActiveTool("pen"); setActiveSheet(null); }}
                    className={`rounded-2xl border px-3 py-3 text-left ${activeTool === "pen" ? "border-pink-500 bg-pink-500/10 text-pink-300" : "border-slate-700 bg-slate-950/50 text-slate-200"}`}
                  >
                    <div className="text-base"><PenTool className="w-4 h-4" /></div>
                    <div className="mt-1 text-xs font-semibold">Bút vẽ</div>
                  </button>
                  <button
                    onClick={() => { setActiveTool("eraser"); setActiveSheet(null); }}
                    className={`rounded-2xl border px-3 py-3 text-left ${activeTool === "eraser" ? "border-pink-500 bg-pink-500/10 text-pink-300" : "border-slate-700 bg-slate-950/50 text-slate-200"}`}
                  >
                    <div className="text-base">🧽</div>
                    <div className="mt-1 text-xs font-semibold">Tẩy</div>
                  </button>
                  <button
                    onClick={() => { setActiveTool("shape"); setSelectedShape("rect"); setActiveSheet(null); }}
                    className="rounded-2xl border border-slate-700 bg-slate-950/50 px-3 py-3 text-left text-slate-200"
                  >
                    <div className="text-base"><Square className="w-4 h-4" /></div>
                    <div className="mt-1 text-xs font-semibold">Hình chữ nhật</div>
                  </button>
                  <button
                    onClick={() => { setActiveTool("shape"); setSelectedShape("circle"); setActiveSheet(null); }}
                    className="rounded-2xl border border-slate-700 bg-slate-950/50 px-3 py-3 text-left text-slate-200"
                  >
                    <div className="text-base"><Circle className="w-4 h-4" /></div>
                    <div className="mt-1 text-xs font-semibold">Hình tròn</div>
                  </button>
                </div>
              )}

              {activeSheet === "sticker" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={startCamera} className="rounded-xl bg-pink-600 px-3 py-2 text-xs font-semibold text-white">
                      Chụp sticker
                    </button>
                    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-semibold text-slate-200">
                      Tải ảnh
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                    <div className="mb-2 text-[11px] font-semibold text-slate-400">Sticker cá nhân</div>
                    <div className="grid grid-cols-3 gap-2">
                      {myStickers.length === 0 ? (
                        <div className="col-span-3 py-6 text-center text-[11px] text-slate-500">Chưa có sticker nào</div>
                      ) : (
                        myStickers.map((st) => (
                          <div key={st.id} className="relative aspect-square">
                            <button
                              onClick={() => {
                                if (!st.url) return;
                                placeStickerToJournal(st.url, st.assetId);
                                setActiveSheet(null);
                              }}
                              disabled={!st.url}
                              className="h-full w-full rounded-lg border border-slate-800 bg-slate-900 p-1 disabled:cursor-not-allowed"
                            >
                              {st.url ? (
                                <img
                                  src={st.url}
                                  alt=""
                                  onError={() => console.error(`Failed to display library sticker "${st.id}".`)}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <span className="text-[10px] text-red-300">Không tải được ảnh</span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestStickerLibraryRemoval(st.id);
                              }}
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white"
                              title="Xóa sticker"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSheet === "format" && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                    <div className="mb-2 text-[11px] font-semibold text-slate-400">Tiêu đề nhật ký</div>
                    <div className="space-y-3">
                      <label className="block text-slate-300">
                        <span className="flex items-center justify-between">
                          <span>Cỡ chữ</span>
                          <span className="text-pink-400">{titleFontSize}px</span>
                        </span>
                        <input
                          type="range"
                          min="12"
                          max="36"
                          step="1"
                          value={titleFontSize}
                          onChange={(event) => setTitleFontSize(Number(event.target.value))}
                          className="mt-1 w-full accent-pink-500"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-slate-300">
                        <span>Màu chữ</span>
                        <input
                          type="color"
                          value={titleColor}
                          onChange={(event) => setTitleColor(event.target.value)}
                          className="h-8 w-10 rounded border-0 bg-transparent"
                        />
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                        <input
                          type="checkbox"
                          checked={titleBold}
                          onChange={(event) => setTitleBold(event.target.checked)}
                          className="accent-pink-500"
                        />
                        Chữ đậm
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                    <div className="mb-2 text-[11px] font-semibold text-slate-400">Định dạng</div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300">Cỡ chữ</span>
                        <input
                          type="number"
                          value={fontSize}
                          onChange={(e) => setFontSize(Number(e.target.value))}
                          className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-pink-300"
                          min="10"
                          max="120"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>Nét bút</span>
                          <span className="text-pink-400">{brushSize}</span>
                        </div>
                        <input type="range" min="1" max="30" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full accent-pink-500" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-slate-300">
                          <span>Độ rõ</span>
                          <span className="text-pink-400">{brushOpacity.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0.1" max="1" step="0.1" value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} className="w-full accent-pink-500" />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300">Màu đang chọn</span>
                        <input type="color" value={activeColor} onChange={(e) => handleColorChange(e.target.value)} className="h-8 w-10 rounded border-0 bg-transparent" />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300">Viền sticker</span>
                        <input
                          type="number"
                          value={borderWidth}
                          onChange={(e) => handleBorderWidthChange(Number(e.target.value))}
                          className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-pink-300"
                          min="0"
                          max="15"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="text-slate-300">Căn lề văn bản</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (selectedTextId) {
                                setTextNotes((prev) => prev.map((n) => n.id === selectedTextId ? { ...n, align: "left" } : n));
                              }
                            }}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center"
                          >
                            Trái
                          </button>
                          <button
                            onClick={() => {
                              if (selectedTextId) {
                                setTextNotes((prev) => prev.map((n) => n.id === selectedTextId ? { ...n, align: "center" } : n));
                              }
                            }}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center"
                          >
                            Giữa
                          </button>
                          <button
                            onClick={() => {
                              if (selectedTextId) {
                                setTextNotes((prev) => prev.map((n) => n.id === selectedTextId ? { ...n, align: "right" } : n));
                              }
                            }}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center"
                          >
                            Phải
                          </button>
                        </div>
                      </div>

                      {(selectedStickerId || selectedTextId) && (
                        <div className="space-y-2">
                          <div className="text-slate-300">Xoay</div>
                          <div className="flex gap-2">
                            <button onClick={() => rotateSelectedItem(-90)} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center">↺ 90°</button>
                            <button onClick={() => rotateSelectedItem(90)} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center">↻ 90°</button>
                            <button onClick={() => rotateSelectedItem(180)} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-center">180°</button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="360"
                              value={selectedRotation}
                              onChange={(e) => updateSelectedItemRotation(Number(e.target.value))}
                              className="w-full accent-pink-500"
                            />
                            <span className="w-8 text-right font-mono text-pink-400">{selectedRotation}°</span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <label className="text-slate-300">Font chữ</label>
                        <select
                          value={journalFont}
                          onChange={(e) => setJournalFont(e.target.value)}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-slate-200"
                        >
                          <option value="font-sans">Modern Sans</option>
                          <option value="font-serif">Classic Serif</option>
                          <option value="font-mono">Typewriter</option>
                          <option value="'MS Mincho', serif">Mincho</option>
                          <option value="'MS Gothic', sans-serif">Gothic</option>
                          <option value="'HGGothicE', sans-serif">HGP</option>
                          <option value="'Brush Script MT', cursive">Artistic Script</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSheet === "pages" && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                    <div className="mb-2 text-[11px] font-semibold text-slate-400">Mẫu trang sổ</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setPaperBackground("lined")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "lined" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kẻ ngang</button>
                      <button onClick={() => setPaperBackground("grid")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "grid" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kẻ ô ly</button>
                      <button onClick={() => setPaperBackground("kraft")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "kraft" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kraft</button>
                      <button onClick={() => setPaperBackground("white")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "white" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Trắng</button>
                    </div>
                    <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-indigo-800/60 bg-indigo-950/60 px-3 py-2 text-xs font-semibold text-indigo-300">
                      <ImageIcon className="mr-2 w-3.5 h-3.5" /> Tải mẫu sổ từ ảnh
                      <input type="file" accept="image/*" onChange={handleCustomPaperUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* LAYOUT CHÍNH */}
      <div className="w-full max-w-6xl flex flex-col gap-6 items-start">
        <div className="flex-1 w-full">
          <div 
            ref={journalRef}
            onClick={handleJournalClick}
            style={{
              backgroundImage: paperBackground === "custom" && customPaperUrl ? `url(${customPaperUrl})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center"
            }}
            className={`relative w-full h-[620px] rounded-2xl overflow-hidden border border-slate-300 shadow-xl transition-all text-slate-800 ${
              paperBackground === "grid" ? "bg-grid" : paperBackground === "kraft" ? "bg-kraft" : paperBackground === "white" ? "bg-white-paper" : paperBackground === "lined" ? "bg-lined" : ""
            }`}
          >
            {/* HEADER SỔ */}
            <div className="pt-6 px-8 flex justify-between items-center border-b border-pink-200/60 pb-3">
              <input 
                type="text" 
                placeholder="Tiêu đề nhật ký hôm nay..."
                value={journalTitle} 
                onChange={(e) => setJournalTitle(e.target.value)}
                className={`bg-transparent border-none focus:outline-none w-2/3 ${journalFont}`}
                style={{
                  fontFamily: journalFont,
                  fontSize: `${titleFontSize}px`,
                  color: titleColor,
                  fontWeight: titleBold ? 700 : 400,
                }}
              />
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white/70 px-2.5 py-1 rounded-lg border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-pink-500" />
                <input type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} className="bg-transparent border-none focus:outline-none" />
              </div>
            </div>

            {/* DANH SÁCH KHỐI CHỮ */}
            {textNotes.map((note) => {
              const isTextSelected = selectedTextId === note.id;

              return (
                <Rnd
                  key={note.id}
                  default={{
                    x: note.x,
                    y: note.y,
                    width: 250,
                    height: 120,
                  }}
                  bounds="parent"
                  enableResizing={true}
                  className={`group z-30 ${
                    activeTool !== "select" ? "pointer-events-none" : "pointer-events-auto"
                  }`}
                  style={{
                    border: isTextSelected ? "2px dashed rgba(244, 114, 182, 0.95)" : "1px solid transparent",
                    borderRadius: isTextSelected ? "10px" : undefined,
                    background: isTextSelected ? "rgba(244, 114, 182, 0.08)" : undefined,
                  }}
                  onClick={() => setSelectedTextId(note.id)}
                >
                  <div
                    className="relative w-full h-full"
                    id={`text-${note.id}`}
                    style={{
                      transform: `rotate(${note.rotation || 0}deg)`,
                      transformOrigin: "center center",
                    }}
                  >
                    <textarea
                      autoFocus
                      placeholder="Nhập chữ..."
                      value={note.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTextNotes((prev) =>
                          prev.map((n) => (n.id === note.id ? { ...n, text: val } : n))
                        );
                      }}
                      style={{
                        fontSize: `${note.fontSize}px`,
                        color: note.color,
                        fontFamily: note.fontFamily,
                        lineHeight: "1.4",
                        textAlign: note.align || "left",
                      }}
                      className="w-full h-full bg-transparent border-none outline-none resize-none font-semibold break-words overflow-hidden p-1"
                    />

                    {isTextSelected && activeTool === "select" && (
                      <>
                        <button
                          type="button"
                          onPointerDown={(e) => handleRotateStart(e, note.id, "text")}
                          className="absolute -top-6 left-1/2 -translate-x-1/2 bg-pink-500 text-white w-6 h-6 rounded-full shadow flex items-center justify-center text-xs z-50 cursor-grab active:cursor-grabbing"
                          style={{ touchAction: "none" }}
                        >
                          🔄
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTextNotes((prev) => prev.filter((n) => n.id !== note.id));
                            setSelectedTextId((prev) => (prev === note.id ? null : prev));
                          }}
                          className="absolute -bottom-3 -right-3 bg-red-500 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center shadow z-50 cursor-pointer"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </Rnd>
              );
            })}

            {/* CANVAS VẼ */}
            <canvas
              ref={canvasRef}
              width={800}
              height={620}
              onPointerDown={startDrawing}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerMove={draw}
              style={{ touchAction: "none" }}
              className={`absolute inset-0 z-20 h-full w-full ${
                activeTool !== "select"
                  ? "cursor-crosshair pointer-events-auto"
                  : "pointer-events-none"
              }`}
            />

            {/* NAVIGATION CUỐI TRANG */}
            <div className="absolute inset-x-4 bottom-4 z-30 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-300 bg-white/85 px-2 py-1.5 shadow-sm backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => goToPage(activePageIndex - 1)}
                  disabled={activePageIndex === 0}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-bold text-slate-700 ${activePageIndex === 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-100"}`}
                >
                  ←
                </button>

                <div className="min-w-[86px] rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-center text-[11px] font-bold tracking-[0.15em] text-slate-700">
                  {activePageIndex + 1} / {pages.length}
                </div>

                <button
                  type="button"
                  onClick={addPage}
                  className="rounded-full border border-pink-300 bg-pink-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-pink-400"
                >
                  ＋ Trang
                </button>

                <button
                  type="button"
                  onClick={deleteCurrentPage}
                  disabled={pages.length <= 1}
                  className={`rounded-full border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 ${pages.length <= 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-100"}`}
                >
                  Xóa
                </button>

                <button
                  type="button"
                  onClick={() => goToPage(activePageIndex + 1)}
                  disabled={activePageIndex >= pages.length - 1}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-bold text-slate-700 ${activePageIndex >= pages.length - 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-100"}`}
                >
                  →
                </button>
              </div>
            </div>

            {/* STICKER DÁN TRÊN SỔ */}
            {placedStickers.map((st) => {
              const isSelected = selectedStickerId === st.id;
              return (
                <Rnd
                  key={st.id}
                  size={{ width: st.width, height: st.height }}
                  position={{ x: st.x, y: st.y }}
                  onDragStop={(e, d) => {
                    setPlacedStickers((prev) =>
                      prev.map((s) => (s.id === st.id ? { ...s, x: d.x, y: d.y } : s))
                    );
                  }}
                  onResizeStop={(e, direction, ref, delta, position) => {
                    setPlacedStickers((prev) =>
                      prev.map((s) =>
                        s.id === st.id
                          ? {
                              ...s,
                              width: parseInt(ref.style.width),
                              height: parseInt(ref.style.height),
                              ...position,
                            }
                          : s
                      )
                    );
                  }}
                  bounds="parent"
                  className={`group ${
                    activeTool !== "select" ? "pointer-events-none" : "pointer-events-auto"
                  }`}
                  style={{
                    border: isSelected ? "2px dashed rgba(244, 114, 182, 0.95)" : "1px solid transparent",
                    borderRadius: isSelected ? "10px" : undefined,
                    background: isSelected ? "rgba(244, 114, 182, 0.08)" : undefined,
                  }}
                  onClick={() => setSelectedStickerId(st.id)}
                >
                  <div className="relative h-full w-full">
                    <div
                      className="h-full w-full"
                      id={`sticker-${st.id}`}
                      style={{
                        transform: `rotate(${st.rotation || 0}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                      {st.url ? (
                        <img
                          src={st.url}
                          alt=""
                          onError={() => console.error(`Failed to display placed sticker "${st.id}".`)}
                          style={{
                            filter: (st.borderWidth ?? borderWidth) > 0
                              ? `drop-shadow(${(st.borderWidth ?? borderWidth)}px 0 0 ${st.borderColor || activeColor}) ` +
                                `drop-shadow(-${(st.borderWidth ?? borderWidth)}px 0 0 ${st.borderColor || activeColor}) ` +
                                `drop-shadow(0 ${(st.borderWidth ?? borderWidth)}px 0 ${st.borderColor || activeColor}) ` +
                                `drop-shadow(0 -${(st.borderWidth ?? borderWidth)}px 0 ${st.borderColor || activeColor})`
                              : "none"
                          }}
                          className="h-full w-full select-none object-contain pointer-events-none"
                        />
                      ) : (
                        <span className="text-xs text-red-300" title="Không tải được ảnh sticker">
                          Không tải được ảnh
                        </span>
                      )}
                    </div>

                    {isSelected && activeTool === "select" && (
                      <>
                        <button
                          type="button"
                          onPointerDown={(e) => handleRotateStart(e, st.id, "sticker")}
                          className="absolute -top-6 left-1/2 z-50 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-pink-500 text-xs text-white shadow cursor-grab active:cursor-grabbing"
                          style={{ touchAction: "none" }}
                        >
                          🔄
                        </button>

                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlacedStickers((prev) => prev.filter((s) => s.id !== st.id));
                          }}
                          className="absolute -bottom-3 -right-3 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow cursor-pointer"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </Rnd>
              );
            })}
          </div>
        </div>
      </div>

      {isStickerSheetEditorOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-slate-100 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
            <div>
              <h2 className="font-bold text-pink-300">Sticker Sheet Editor · A4</h2>
              <p className="text-xs text-slate-400">
                {activePrintSheet.stickers.length} sticker(s) on sheet {activePrintSheetIndex + 1} of {printSheets.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={autoArrangePrintSheets} className="rounded-lg bg-slate-800 px-3 py-2 text-xs hover:bg-slate-700">
                Auto arrange
              </button>
              <button type="button" onClick={addPrintSheet} className="rounded-lg bg-slate-800 px-3 py-2 text-xs hover:bg-slate-700">
                + A4 page
              </button>
              <button type="button" onClick={() => void exportPrintSheets(false)} className="rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold hover:bg-pink-500">
                Export PDF
              </button>
              <button type="button" onClick={() => void exportPrintSheets(true)} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold hover:bg-slate-600">
                Print
              </button>
              <button type="button" onClick={() => setIsStickerSheetEditorOpen(false)} className="rounded-lg px-3 py-2 text-sm hover:bg-slate-800" aria-label="Close sticker sheet editor">
                ✕
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1 lg:overflow-hidden">
            <aside className="min-h-[180px] max-h-[34vh] shrink-0 space-y-4 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-3 lg:max-h-none lg:min-h-0 lg:shrink">
              <section className="space-y-2">
                <h3 className="text-sm font-bold">Add from current page / library</h3>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  Copies
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={printCopyCount}
                    onChange={(event) => setPrintCopyCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                    className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1"
                  />
                </label>
                {printSources.length === 0 ? (
                  <p className="text-xs text-slate-400">No usable stickers on this page or in the library.</p>
                ) : printSources.map((source) => (
                  <div key={source.id} className="flex items-center gap-2 rounded-lg bg-slate-800 p-2">
                    <img src={source.url} alt="" className="h-10 w-10 rounded object-contain" />
                    <span className="min-w-0 flex-1 truncate text-xs">{source.label}</span>
                    <button type="button" onClick={() => void addPrintStickerCopies(source)} className="rounded bg-pink-600 px-2 py-1 text-xs">Add</button>
                  </div>
                ))}
              </section>

              {selectedPrintSticker && (
                <section className="space-y-3 border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">Selected sticker</h3>
                    <span className="max-w-28 truncate text-[10px] text-slate-400">{selectedPrintSticker.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-300">
                      Width (mm)
                      <input
                        type="number"
                        min={1}
                        max={194}
                        step={0.5}
                        value={selectedPrintSticker.widthMm}
                        onChange={(event) => {
                          const widthMm = Math.max(1, Math.min(194, Number(event.target.value) || 1));
                          const ratio = selectedPrintSticker.aspectRatio || selectedPrintSticker.widthMm / selectedPrintSticker.heightMm;
                          updateSelectedPrintSticker({
                            widthMm,
                            heightMm: selectedPrintSticker.keepAspectRatio ? widthMm / ratio : selectedPrintSticker.heightMm,
                          });
                        }}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                      />
                    </label>
                    <label className="text-xs text-slate-300">
                      Height (mm)
                      <input
                        type="number"
                        min={1}
                        max={281}
                        step={0.5}
                        value={selectedPrintSticker.heightMm}
                        onChange={(event) => {
                          const heightMm = Math.max(1, Math.min(281, Number(event.target.value) || 1));
                          const ratio = selectedPrintSticker.aspectRatio || selectedPrintSticker.widthMm / selectedPrintSticker.heightMm;
                          updateSelectedPrintSticker({
                            heightMm,
                            widthMm: selectedPrintSticker.keepAspectRatio ? heightMm * ratio : selectedPrintSticker.widthMm,
                          });
                        }}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedPrintSticker.keepAspectRatio}
                      onChange={(event) => updateSelectedPrintSticker({ keepAspectRatio: event.target.checked })}
                    />
                    Keep image proportions
                  </label>
                  <label className="block text-xs">
                    Rotation ({Math.round(selectedPrintSticker.rotation)}°)
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={selectedPrintSticker.rotation}
                      onChange={(event) => updateSelectedPrintSticker({ rotation: Number(event.target.value) })}
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedPrintSticker.outlineEnabled}
                      onChange={(event) => updateSelectedPrintSticker({ outlineEnabled: event.target.checked })}
                    />
                    White cut outline
                  </label>
                  {selectedPrintSticker.outlineEnabled && (
                    <label className="block text-xs">
                      Outline thickness ({selectedPrintSticker.outlineWidthMm} mm)
                      <input
                        type="range"
                        min={0.2}
                        max={5}
                        step={0.2}
                        value={selectedPrintSticker.outlineWidthMm}
                        onChange={(event) => updateSelectedPrintSticker({ outlineWidthMm: Number(event.target.value) })}
                        className="mt-1 w-full"
                      />
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={duplicatePrintSticker} className="flex-1 rounded bg-slate-800 px-2 py-2 text-xs hover:bg-slate-700">Duplicate</button>
                    <button type="button" onClick={removeSelectedPrintSticker} className="flex-1 rounded bg-red-900 px-2 py-2 text-xs hover:bg-red-800">Delete</button>
                  </div>
                </section>
              )}
              {printNotice && <p role="status" className="text-xs text-amber-300">{printNotice}</p>}
            </aside>

            <main className="flex min-h-[420px] min-w-0 flex-1 flex-col items-center gap-3 overflow-auto rounded-xl border border-slate-800 bg-slate-900/60 p-3 lg:flex-auto">
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  disabled={activePrintSheetIndex <= 0}
                  onClick={() => { setActivePrintSheetIndex((index) => index - 1); setSelectedPrintStickerId(null); }}
                  className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40"
                >
                  ←
                </button>
                <span>A4 {activePrintSheetIndex + 1} / {printSheets.length}</span>
                <button
                  type="button"
                  disabled={activePrintSheetIndex >= printSheets.length - 1}
                  onClick={() => { setActivePrintSheetIndex((index) => index + 1); setSelectedPrintStickerId(null); }}
                  className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40"
                >
                  →
                </button>
              </div>
              <div
                ref={printPreviewRef}
                className="relative shrink-0 overflow-hidden bg-white shadow-2xl"
                style={{
                  width: "min(100%, 500px)",
                  aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}`,
                  backgroundImage: "linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)",
                  backgroundSize: `${A4_MARGIN_MM * printPreviewScale}px ${A4_MARGIN_MM * printPreviewScale}px`,
                }}
              >
                {activePrintSheet.stickers.map((sticker) => {
                  const selected = sticker.id === selectedPrintStickerId;
                  const outlinePx = sticker.outlineEnabled ? sticker.outlineWidthMm * printPreviewScale : 0;
                  return (
                    <Rnd
                      key={sticker.id}
                      size={{ width: sticker.widthMm * printPreviewScale, height: sticker.heightMm * printPreviewScale }}
                      position={{ x: sticker.xMm * printPreviewScale, y: sticker.yMm * printPreviewScale }}
                      bounds="parent"
                      lockAspectRatio={sticker.keepAspectRatio}
                      onDragStart={() => setSelectedPrintStickerId(sticker.id)}
                      onDragStop={(event, data) => {
                        const { xMm, yMm } = clampPrintStickerPosition(
                          sticker,
                          sticker.widthMm,
                          sticker.heightMm,
                          data.x / printPreviewScale,
                          data.y / printPreviewScale
                        );
                        setPrintSheets((previous) => previous.map((sheet, sheetIndex) => ({
                          ...sheet,
                          stickers: sheet.stickers.map((item) =>
                            sheetIndex === activePrintSheetIndex && item.id === sticker.id
                              ? { ...item, xMm, yMm }
                              : item
                          ),
                        })));
                      }}
                      onResizeStop={(event, direction, ref, delta, position) => {
                        const widthMm = Math.max(1, parseFloat(ref.style.width) / printPreviewScale);
                        const heightMm = Math.max(1, parseFloat(ref.style.height) / printPreviewScale);
                        const { xMm, yMm } = clampPrintStickerPosition(
                          sticker,
                          widthMm,
                          heightMm,
                          position.x / printPreviewScale,
                          position.y / printPreviewScale
                        );
                        setPrintSheets((previous) => previous.map((sheet, sheetIndex) => ({
                          ...sheet,
                          stickers: sheet.stickers.map((item) =>
                            sheetIndex === activePrintSheetIndex && item.id === sticker.id
                              ? {
                                  ...item,
                                  widthMm,
                                  heightMm,
                                  xMm,
                                  yMm,
                                }
                              : item
                          ),
                        })));
                      }}
                      onClick={() => setSelectedPrintStickerId(sticker.id)}
                      style={{
                        zIndex: selected ? 2 : 1,
                        outline: selected ? "1px dashed #ec4899" : "none",
                      }}
                      className="group"
                    >
                      <img
                        src={sticker.url}
                        alt={sticker.label}
                        draggable={false}
                        className="h-full w-full select-none object-fill"
                        style={{
                          transform: `rotate(${sticker.rotation}deg)`,
                          filter: outlinePx > 0
                            ? `drop-shadow(${outlinePx}px 0 0 white) drop-shadow(-${outlinePx}px 0 0 white) drop-shadow(0 ${outlinePx}px 0 white) drop-shadow(0 -${outlinePx}px 0 white)`
                            : "none",
                        }}
                      />
                    </Rnd>
                  );
                })}
              </div>
              <p className="text-center text-xs text-slate-400">A4 portrait · 210 × 297 mm · PDF output uses 300 DPI rasterized sticker outlines</p>
            </main>
          </div>
        </div>
      )}

      {/* POPUP CAMERA CROP */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden border-2 border-slate-700 shadow-2xl">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <Rnd
              size={{ width: cropBox.width, height: cropBox.height }}
              position={{ x: cropBox.x, y: cropBox.y }}
              onDragStop={(e, d) => setCropBox({ ...cropBox, x: d.x, y: d.y })}
              onResizeStop={(e, direction, ref, delta, position) => {
                setCropBox({ width: parseInt(ref.style.width), height: parseInt(ref.style.height), ...position });
              }}
              bounds="parent"
              className="border-2 border-dashed border-pink-400 bg-pink-500/20 rounded-2xl flex items-center justify-center"
            >
              <span className="text-[10px] text-white bg-pink-600/90 px-2 py-0.5 rounded-full font-semibold">Kéo góc để thu phóng</span>
            </Rnd>
          </div>

          <div className="flex gap-4 mt-6">
            <button onClick={stopCamera} className="px-5 py-2.5 bg-slate-800 text-slate-300 font-semibold rounded-2xl text-sm">Hủy</button>
            <button onClick={captureCameraSticker} className="px-6 py-2.5 bg-pink-600 text-white font-semibold rounded-2xl text-sm flex items-center gap-2"><Camera className="w-4 h-4" /> Chụp & Tách Nền AI</button>
          </div>
        </div>
      )}

      {pendingStickerDeleteId && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={cancelStickerLibraryRemoval}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-sticker-title"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="delete-sticker-title" className="text-lg font-bold text-pink-300">
                Xóa sticker này nhé?
              </h2>
              <button
                type="button"
                onClick={cancelStickerLibraryRemoval}
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Đóng hộp thoại"
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Sticker sẽ bị xóa khỏi kho cá nhân của bạn. Những sticker đã đặt trên trang nhật ký sẽ không bị ảnh hưởng.
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={skipDeleteConfirmationForCurrentSticker}
                onChange={(event) => setSkipDeleteConfirmationForCurrentSticker(event.target.checked)}
                className="h-4 w-4 accent-pink-500"
              />
              Không hỏi lại lần sau
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={cancelStickerLibraryRemoval}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmStickerLibraryRemoval}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Xóa sticker
              </button>
            </div>
          </section>
        </div>
      )}

      {isProcessingAI && <AILoadingModal />}
    </div>
  );
}

function AILoadingModal() {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900/90 border border-pink-500/30 rounded-3xl p-7 max-w-xs w-full text-center shadow-2xl flex flex-col items-center gap-4">
        <div className="w-20 h-20 bg-gradient-to-tr from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center border border-pink-400/30 shadow-inner">
          <span className="text-4xl animate-bounce">🧸</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1">
          <h3 className="text-sm font-semibold text-pink-200">Đang tách nền tốc độ cao... ✨</h3>
          <p className="text-xs text-slate-400 italic">Chờ tớ tích tắc là xong ngay!</p>
        </div>
      </div>
    </div>
  );
}