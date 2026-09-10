"use client";

import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { 
  Camera, Image as ImageIcon, Trash2, Undo2, 
  Download, Printer, Sparkles, Upload, Calendar, 
  PenTool, Globe, Minus, Square, Circle, ArrowRight
} from "lucide-react";
import { removeBackground } from "@imgly/background-removal";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface SavedSticker {
  id: string;
  url: string;
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
};

interface TextNote {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
}



const PRESET_STICKERS = [
  { id: "d1", name: "Viền nét đứt", url: "https://api.iconify.design/lucide:dashed-circle.svg?color=white" },
  { id: "d2", name: "Mặt cười cute", url: "https://api.iconify.design/fluent-emoji-flat:grinning-cat-with-smiling-eyes.svg" },
  { id: "d3", name: "Khung thoại", url: "https://api.iconify.design/ph:chat-teardrop-text-bold.svg?color=white" },
  { id: "d4", name: "Mũi tên chỉ", url: "https://api.iconify.design/ph:arrow-arc-left-bold.svg?color=white" },
  { id: "d5", name: "Lia sáng", url: "https://api.iconify.design/ph:sparkle-fill.svg?color=yellow" },
  { id: "d6", name: "Trái tim", url: "https://api.iconify.design/ph:heart-dashed-bold.svg?color=pink" },
];

export default function DigitalJournalApp() {
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [borderWidth, setBorderWidth] = useState(3);

  const [fontSize, setFontSize] = useState(24);
  const [brushSize, setBrushSize] = useState(4); // Cỡ nét bút vẽ
  const [brushOpacity, setBrushOpacity] = useState(1);

  const [myStickers, setMyStickers] = useState<SavedSticker[]>([]);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  const [paperBackground, setPaperBackground] = useState<"lined" | "grid" | "kraft" | "white" | "custom">("lined");
  const [customPaperUrl, setCustomPaperUrl] = useState<string | null>(null);

  const [journalFont, setJournalFont] = useState<string>("font-sans");
  const [journalDate, setJournalDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [journalTitle, setJournalTitle] = useState("");
  const [textNotes, setTextNotes] = useState<TextNote[]>([]);

  const [activeTool, setActiveTool] = useState<"select" | "text" | "pen" | "eraser" | "shape">("select");
  const [drawOnTop, setDrawOnTop] = useState<boolean>(true);
  const [selectedShape, setSelectedShape] = useState<"line" | "arrow" | "rect" | "circle">("rect");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawHistory, setDrawHistory] = useState<ImageData[]>([]);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    import("@imgly/background-removal");
  }, []);

 // Khi đổi màu
const handleColorChange = (newColor: string) => {
  setActiveColor(newColor);
  if (selectedStickerId) {
    setPlacedStickers((prev) =>
      prev.map((s) => (s.id === selectedStickerId ? { ...s, borderColor: newColor } : s))
    );
  }
};

// Khi kéo thanh chỉnh độ dày viền
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
    };
    setTextNotes((prev) => [...prev, newNote]);
  };

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [cropBox, setCropBox] = useState({ x: 40, y: 40, width: 220, height: 220 });

  useEffect(() => {
    const addGoogleTranslateScript = () => {
      if (!document.getElementById("google-translate-script")) {
        const script = document.createElement("script");
        script.id = "google-translate-script";
        script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
        document.body.appendChild(script);
        (window as any).googleTranslateElementInit = () => {
          new (window as any).google.translate.TranslateElement(
            { pageLanguage: "vi", layout: (window as any).google.translate.TranslateElement.InlineLayout.HORIZONTAL },
            "google_translate_element"
          );
        };
      }
    };
    addGoogleTranslateScript();
  }, []);

  const journalRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const processAndSaveStickerAI = async (imageDataUrl: string) => {
    setIsProcessingAI(true);
    try {
      const blob = await new Promise<Blob>((resolve) => {
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
          canvas.toBlob((b) => resolve(b || new Blob()), "image/png", 0.8);
        };
      });

      const resultBlob = await removeBackground(blob, { model: "isnet_quint8" });
      const stickerUrl = URL.createObjectURL(resultBlob);
      setMyStickers((prev) => [{ id: Date.now().toString(), url: stickerUrl }, ...prev]);
    } catch (err) {
      setMyStickers((prev) => [{ id: Date.now().toString(), url: imageDataUrl }, ...prev]);
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

  const placeStickerToJournal = (url: string) => {
    const newSticker: PlacedSticker = {
      id: Date.now().toString(),
      url: url,
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

  const handleRotateStart = (
    e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>,
    stickerId: string
  ) => {
    e.stopPropagation();
    const element = document.getElementById(`sticker-${stickerId}`);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      let clientX = 0, clientY = 0;
      if ("touches" in moveEvent && moveEvent.touches.length > 0) {
        clientX = moveEvent.touches[0].clientX;
        clientY = moveEvent.touches[0].clientY;
      } else if ("clientX" in moveEvent) {
        clientX = (moveEvent as MouseEvent).clientX;
        clientY = (moveEvent as MouseEvent).clientY;
      }
      const radians = Math.atan2(clientY - centerY, clientX - centerX);
      let degrees = radians * (180 / Math.PI) + 90;
      if (degrees < 0) degrees += 360;

      setPlacedStickers((prev) =>
        prev.map((s) => (s.id === stickerId ? { ...s, rotation: Math.round(degrees) } : s))
      );
    };

    const handleEnd = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove);
    window.addEventListener("touchend", handleEnd);
  };

  const saveDrawState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) setDrawHistory((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    }
  };

  const undoDraw = () => {
    if (drawHistory.length === 0) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const newHistory = [...drawHistory];
        newHistory.pop();
        setDrawHistory(newHistory);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (newHistory.length > 0) ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
      }
    }
  };

  const startDrawing = (e: any) => {
    if (activeTool === "select") return;
    saveDrawState();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    setStartPos({ x, y });
  };

  const draw = (e: any) => {
    if (!isDrawing || activeTool === "select") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = brushOpacity;

    if (activeTool === "pen") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = brushSize;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (activeTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = brushSize * 4;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const stopDrawing = (e: any) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas || !startPos) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const endX = (e.clientX || e.changedTouches?.[0]?.clientX) - rect.left;
    const endY = (e.clientY || e.changedTouches?.[0]?.clientY) - rect.top;

    if (activeTool === "shape") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = brushSize;
      ctx.globalAlpha = brushOpacity;
      ctx.beginPath();

      if (selectedShape === "rect") {
        ctx.strokeRect(startPos.x, startPos.y, endX - startPos.x, endY - startPos.y);
      } else if (selectedShape === "circle") {
        const radius = Math.hypot(endX - startPos.x, endY - startPos.y);
        ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (selectedShape === "line") {
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      } else if (selectedShape === "arrow") {
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        const angle = Math.atan2(endY - startPos.y, endX - startPos.x);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 12 * Math.cos(angle - Math.PI / 6), endY - 12 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - 12 * Math.cos(angle + Math.PI / 6), endY - 12 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = activeColor;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
  };

  const exportPNG = async () => {
    if (!journalRef.current) return;
    const canvas = await html2canvas(journalRef.current, { scale: 2 });
    const link = document.createElement("a");
    link.download = `nhat-ky-${journalDate}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const exportPDF = async () => {
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.setFontSize(16);
    pdf.text(`BẢNG IN STICKER A4 - NGÀY ${journalDate}`, 20, 20);

    let posX = 20, posY = 30;
    for (let i = 0; i < placedStickers.length; i++) {
      try {
        pdf.addImage(placedStickers[i].url, "PNG", posX, posY, 40, 40);
        pdf.rect(posX - 2, posY - 2, 44, 44, "S");
        posX += 55;
        if (posX > 150) { posX = 20; posY += 55; }
      } catch (e) {}
    }
    pdf.save("sticker-A4.pdf");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-3 sm:p-6 font-sans">
      <style>{`
  .bg-lined { background-color: #fdfbf7; background-image: repeating-linear-gradient(transparent, transparent 27px, #e2e8f0 28px); }
  .bg-grid { background-color: #fdfbf7; background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px); background-size: 24px 24px; }
  .bg-kraft { background-color: #f5efe6; }
  .bg-white-paper { background-color: #ffffff; }
  
  /* Hiện rõ khung chọn ngôn ngữ Google Translate */
  #google_translate_element select {
    background-color: #1e293b !important;
    color: #f472b6 !important;
    border: 1px solid #475569 !important;
    border-radius: 8px !important;
    padding: 4px 8px !important;
    font-size: 12px !important;
    outline: none !important;
    cursor: pointer !important;
  }
  .goog-te-gadget { color: transparent !important; font-size: 0 !important; }
  .goog-te-gadget span { display: none !important; }
`}</style>


      {/* HEADER */}
      <header className="w-full max-w-6xl flex flex-wrap items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-4 gap-3">
        <h1 className="text-xl font-bold text-pink-500 flex items-center gap-2">📖 Nhật Ký Sticker & Note Số</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700">
            <Globe className="w-4 h-4 text-pink-400 shrink-0" />
            <div id="google_translate_element"></div>
          </div>
          <button onClick={exportPNG} className="px-3.5 py-2 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5"><Download className="w-4 h-4" /> Lưu Ảnh</button>
          <button onClick={exportPDF} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center gap-1.5"><Printer className="w-4 h-4" /> In A4</button>
        </div>
      </header>

      {/* TOOLBAR NÂNG CẤP */}
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 p-3 rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* CÔNG CỤ HOẠT ĐỘNG */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
          <button onClick={() => setActiveTool("select")} className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${activeTool === "select" ? "bg-pink-600 text-white" : "text-slate-300"}`}>Con Trỏ</button>
          <button onClick={() => setActiveTool("text")} className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${activeTool === "text" ? "bg-pink-600 text-white" : "text-slate-300"}`}>✍️ Văn Bản</button>
          <button onClick={() => setActiveTool("pen")} className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${activeTool === "pen" ? "bg-pink-600 text-white" : "text-slate-300"}`}><PenTool className="w-3.5 h-3.5" /> Bút Vẽ</button>
          <button onClick={() => setActiveTool("eraser")} className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${activeTool === "eraser" ? "bg-pink-600 text-white" : "text-slate-300"}`}>Tẩy</button>
        </div>

        {/* THÔNG SỐ VĂN BẢN VÀ BÚT VẼ */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
          {/* Cỡ chữ */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">🔤 Cỡ chữ:</span>
            <input 
              type="number" 
              value={fontSize} 
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-12 bg-slate-900 text-pink-400 text-xs text-center rounded border border-slate-700 p-0.5"
              min="10" max="120"
            />
          </div>

          {/* Cỡ nét bút vẽ */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <span className="text-[11px] text-slate-400">✏️ Nét bút:</span>
            <input 
              type="range" min="1" max="30" 
              value={brushSize} 
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-16 accent-pink-500 h-1 bg-slate-800 rounded cursor-pointer"
            />
            <span className="text-[10px] text-pink-400 font-mono w-4">{brushSize}</span>
          </div>

          {/* Độ mờ nét vẽ (Opacity) */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <span className="text-[11px] text-slate-400">💧 Độ rõ:</span>
            <input 
              type="range" min="0.1" max="1" step="0.1"
              value={brushOpacity} 
              onChange={(e) => setBrushOpacity(Number(e.target.value))}
              className="w-16 accent-pink-500 h-1 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* SHAPES */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("rect"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "rect" ? "bg-pink-500/20 text-pink-400" : "text-slate-400"}`}><Square className="w-4 h-4" /></button>
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("circle"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "circle" ? "bg-pink-500/20 text-pink-400" : "text-slate-400"}`}><Circle className="w-4 h-4" /></button>
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("line"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "line" ? "bg-pink-500/20 text-pink-400" : "text-slate-400"}`}><Minus className="w-4 h-4" /></button>
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("arrow"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "arrow" ? "bg-pink-500/20 text-pink-400" : "text-slate-400"}`}><ArrowRight className="w-4 h-4" /></button>
        </div>

        {/* FONT CHỮ */}
        <div className="flex items-center gap-2">
          <select 
            value={journalFont} 
            onChange={(e) => setJournalFont(e.target.value)}
            className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer"
          >
            <option value="font-sans">Modern Sans (Hiện đại)</option>
            <option value="font-serif">Classic Serif (Trang trọng)</option>
            <option value="font-mono">Typewriter (Máy gõ)</option>
            <option value="'MS Mincho', serif">游明朝 / Mincho (Nhật Cổ Điển)</option>
            <option value="'MS Gothic', sans-serif">游ゴシック / Gothic (Nhật Đậm)</option>
            <option value="'HGGothicE', sans-serif">HGP教科書体 (Giáo Khoa Thư)</option>
            <option value="'Brush Script MT', cursive">Artistic Script (Nghệ Thuật)</option>
          </select>

          <button onClick={undoDraw} className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 font-semibold"><Undo2 className="w-3.5 h-3.5" /> Hoàn tác</button>
        </div>
      </div>

      {/* LAYOUT CHÍNH */}
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-6 items-start">
        
        {/* CỘT TRÁI */}
        <div className="w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 flex-shrink-0">
          <h2 className="text-sm font-bold text-pink-400 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Kho Sticker Cá Nhân</h2>

          <div className="space-y-2">
            <button onClick={startCamera} className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2"><Camera className="w-4 h-4" /> Chụp Sticker Mới</button>
            <label className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-700">
              <Upload className="w-4 h-4" /> Tải Ảnh Tách Nền...
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* BẢNG MÀU CHUNG & CHỈNH VIỀN STICKER ĐANG CHỌN */}
          <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-3 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-pink-300">🎨 Chọn Màu Sắc</span>
              <input type="color" value={activeColor} onChange={(e) => handleColorChange(e.target.value)} className="w-7 h-7 rounded-full border-0 cursor-pointer bg-transparent" />
            </div>

            <div className="space-y-1 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>✨ Viền Sticker (Chọn sticker trên sổ):</span>
                <span className="text-pink-400 font-mono">{borderWidth}px</span>
              </div>
              <input type="range" min="0" max="15" value={borderWidth} onChange={(e) => handleBorderWidthChange(Number(e.target.value))} className="w-full accent-pink-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer" />
            </div>
          </div>

          {/* STICKER MẪU */}
          <div className="pt-2 border-t border-slate-800">
            <p className="text-xs font-semibold text-slate-400 mb-2">✨ Sticker Mẫu Có Sẵn:</p>
            <div className="grid grid-cols-3 gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-800/60 mb-3">
              {PRESET_STICKERS.map((st) => (
                <button key={st.id} onClick={() => placeStickerToJournal(st.url)} className="aspect-square bg-slate-900 hover:bg-slate-800 rounded-lg p-1.5 border border-slate-800 flex items-center justify-center">
                  <img src={st.url} alt="preset" className="w-full h-full object-contain pointer-events-none" />
                </button>
              ))}
            </div>
          </div>

          {/* KHO STICKER CỦA BẠN */}
          <div className="pt-1">
            <p className="text-xs text-slate-400 mb-2">Chạm sticker để dán vào trang sổ:</p>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 min-h-[160px] max-h-[220px] overflow-y-auto grid grid-cols-3 gap-2">
              {myStickers.length === 0 ? (
                <div className="col-span-3 text-center py-8 text-xs text-slate-500">Chưa có sticker. Chụp hoặc tải ảnh lên nhé!</div>
              ) : (
                myStickers.map((st) => (
                  <button key={st.id} onClick={() => placeStickerToJournal(st.url)} className="aspect-square bg-slate-900 rounded-lg p-1 border border-slate-800 flex items-center justify-center">
                    <img src={st.url} alt="Sticker" className="w-full h-full object-contain" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* MẪU SỔ */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-slate-400">Mẫu Trang Sổ:</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setPaperBackground("lined")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "lined" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kẻ Ngang</button>
              <button onClick={() => setPaperBackground("grid")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "grid" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kẻ Ô Ly</button>
              <button onClick={() => setPaperBackground("kraft")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "kraft" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kraft Vintage</button>
              <button onClick={() => setPaperBackground("white")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "white" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Trắng Trơn</button>
            </div>
            <label className="w-full mt-2 py-2 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-800/60">
              <ImageIcon className="w-3.5 h-3.5" /> Tải Mẫu Sổ Từ Ảnh
              <input type="file" accept="image/*" onChange={handleCustomPaperUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* CỘT PHẢI: CANVA SỔ */}
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
                className={`bg-transparent text-lg font-bold text-slate-800 border-none focus:outline-none w-2/3 ${journalFont}`}
                style={{ fontFamily: journalFont }}
              />
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white/70 px-2.5 py-1 rounded-lg border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-pink-500" />
                <input type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} className="bg-transparent border-none focus:outline-none" />
              </div>
            </div>

            {/* DANH SÁCH KHỐI CHỮ (KÉO RỘNG RÃI CHUẨN WORD) */}
            {textNotes.map((note) => (
              <Rnd
                key={note.id}
                default={{ x: note.x, y: note.y, width: Math.max(200, note.fontSize * note.text.length * 0.8), height: note.fontSize * 1.8 + 10 }}
                bounds="parent"
                enableResizing={true}
                className="group z-20"
              >
                <div className="relative w-full h-full flex items-center">
                  <textarea
                    autoFocus
                    placeholder="Nhập chữ..."
                    value={note.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTextNotes(prev => prev.map(n => n.id === note.id ? { ...n, text: val } : n));
                    }}
                    style={{
                      fontSize: `${note.fontSize}px`,
                      color: note.color,
                      fontFamily: note.fontFamily,
                      lineHeight: "1.2"
                    }}
                    className="w-full h-full bg-transparent border border-dashed border-transparent hover:border-pink-400 focus:border-pink-500 focus:bg-white/40 rounded px-1.5 py-0.5 focus:outline-none resize-none font-semibold whitespace-nowrap overflow-hidden"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTextNotes(prev => prev.filter(n => n.id !== note.id));
                    }}
                    className="opacity-0 group-hover:opacity-100 absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center shadow z-30"
                  >
                    ✕
                  </button>
                </div>
              </Rnd>
            ))}

            {/* CANVAS VẼ */}
            <canvas
  ref={canvasRef}
  width={800}
  height={620}
  onMouseDown={startDrawing}
  onMouseUp={stopDrawing}
  onMouseMove={draw}
  onTouchStart={startDrawing}
  onTouchEnd={stopDrawing}
  onTouchMove={draw}
  className={`absolute inset-0 z-20 ${
    activeTool !== "select"
      ? "cursor-crosshair pointer-events-auto"
      : "pointer-events-none"
  }`}
/>

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
        transform: `rotate(${st.rotation || 0}deg)`,
      }}
      onClick={() => setSelectedStickerId(st.id)}
    >
      <div className="relative w-full h-full">
      <img
  src={st.url}
  alt="sticker"
  style={{
    // Đổ viền chuẩn theo màu (borderColor) và độ dày (borderWidth) của từng sticker
    filter: (st.borderWidth ?? borderWidth) > 0 
      ? `drop-shadow(${(st.borderWidth ?? borderWidth)}px 0 0 ${st.borderColor || activeColor}) ` +
        `drop-shadow(-${(st.borderWidth ?? borderWidth)}px 0 0 ${st.borderColor || activeColor}) ` +
        `drop-shadow(0 ${(st.borderWidth ?? borderWidth)}px 0 ${st.borderColor || activeColor}) ` +
        `drop-shadow(0 -${(st.borderWidth ?? borderWidth)}px 0 ${st.borderColor || activeColor})`
      : "none"
  }}
  className={`w-full h-full object-contain pointer-events-none select-none ${
    isSelected ? "ring-2 ring-pink-500 rounded-lg" : ""
  }`}
/>

        {/* CÁC NÚT ĐIỀU KHIỂN KHI CHỌN STICKER */}
        {isSelected && activeTool === "select" && (
          <>
            {/* Nút xoay */}
            <button
              onMouseDown={(e) => handleRotateStart(e, st.id)}
              onTouchStart={(e) => handleRotateStart(e, st.id)}
              className="absolute -top-6 left-1/2 -translate-x-1/2 bg-pink-500 text-white w-6 h-6 rounded-full shadow flex items-center justify-center text-xs z-50 cursor-grab active:cursor-grabbing"
            >
              🔄
            </button>

            {/* Nút đẩy Sticker lên trên cùng */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPlacedStickers((prev) => [
                  ...prev.filter((s) => s.id !== st.id),
                  st,
                ]);
              }}
              title="Đưa lên trên cùng"
              className="absolute -top-6 right-0 bg-slate-800 text-pink-400 w-6 h-6 rounded-full shadow text-[10px] font-bold flex items-center justify-center border border-slate-600 z-50 hover:bg-slate-700"
            >
              ▲
            </button>

            {/* Nút xóa */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPlacedStickers((prev) => prev.filter((s) => s.id !== st.id));
              }}
              className="absolute -bottom-3 -right-3 bg-red-500 text-white w-6 h-6 rounded-full shadow flex items-center justify-center text-xs z-50"
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