"use client";

import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { 
  Camera, Image as ImageIcon, Trash2, Undo2, 
  Download, Printer, Sparkles, Upload, Calendar, 
  Highlighter, PenTool, Type, Globe, RotateCw, X,
  Square, Circle, ArrowRight, MessageSquare, Star, Minus, Layers
} from "lucide-react";
import { removeBackground } from "@imgly/background-removal";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface SavedSticker {
  id: string;
  url: string;
}

interface PlacedSticker {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

interface TextNote {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export default function DigitalJournalApp() {
  // --- KHO STICKER & SỔ NHẬT KÝ ---
  const [myStickers, setMyStickers] = useState<SavedSticker[]>([]);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  // Mẫu sổ nhật ký
  const [paperBackground, setPaperBackground] = useState<"lined" | "grid" | "kraft" | "white" | "custom">("lined");
  const [customPaperUrl, setCustomPaperUrl] = useState<string | null>(null);

  // Phông chữ & Nội dung
  const [journalFont, setJournalFont] = useState<string>("font-sans");
  const [journalDate, setJournalDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [textNotes, setTextNotes] = useState<TextNote[]>([]);

  // BÚT VẼ, HÌNH DẠNG & MÀU SẮC (PAINT STYLE)
  const [activeTool, setActiveTool] = useState<"select" | "pen" | "highlighter" | "eraser" | "shape">("select");
  const [selectedShape, setSelectedShape] = useState<"line" | "arrow" | "rect" | "circle" | "star" | "bubble">("rect");
  const [brushColor, setBrushColor] = useState("#f43f5e");
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawHistory, setDrawHistory] = useState<ImageData[]>([]);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
// Hàm click vào trang sổ để tạo Text Box tự do
  const handleJournalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "select") return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newNote = {
      id: Date.now().toString(),
      text: "",
      x: Math.max(10, x - 50),
      y: Math.max(10, y - 15),
      fontSize: 14,
      color: "#1e293b"
    };
    setTextNotes((prev) => [...prev, newNote]);
  };

  // Camera & AI
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [cropBox, setCropBox] = useState({ x: 40, y: 40, width: 220, height: 220 });

  // TÍCH HỢP GOOGLE TRANSLATE 100+ NGÔN NGỮ
  useEffect(() => {
    const addGoogleTranslateScript = () => {
      if (!document.getElementById("google-translate-script")) {
        const script = document.createElement("script");
        script.id = "google-translate-script";
        script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
        document.body.appendChild(script);
        (window as any).googleTranslateElementInit = () => {
          new (window as any).google.translate.TranslateElement(
            { 
              pageLanguage: "vi", 
              layout: (window as any).google.translate.TranslateElement.InlineLayout.HORIZONTAL 
            },
            "google_translate_element"
          );
        };
      }
    };
    addGoogleTranslateScript();
  }, []);

  // Refs
  const journalRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRotatingRef = useRef(false);

  // TÁCH NỀN AI STICKER
  const processAndSaveStickerAI = async (imageDataUrl: string) => {
    setIsProcessingAI(true);
    setLoadingProgress(20);
    const interval = setInterval(() => {
      setLoadingProgress(prev => (prev < 85 ? prev + 15 : prev));
    }, 250);

    try {
      const blob = await removeBackground(imageDataUrl);
      const stickerUrl = URL.createObjectURL(blob);
      setLoadingProgress(100);
      clearInterval(interval);
      setMyStickers(prev => [{ id: Date.now().toString(), url: stickerUrl }, ...prev]);
    } catch (err) {
      setMyStickers(prev => [{ id: Date.now().toString(), url: imageDataUrl }, ...prev]);
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

  // CAMERA
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
    const newPlaced: PlacedSticker = {
      id: Date.now().toString(),
      url,
      x: 120,
      y: 120,
      width: 120,
      height: 120,
      rotation: 0,
      zIndex: placedStickers.length + 1
    };
    setPlacedStickers([...placedStickers, newPlaced]);
    setSelectedStickerId(newPlaced.id);
  };

  // NÚT XOAY STICKER TRỰC TIẾP TRÊN KHUNG (PAINT/CANVA STYLE)
  const handleRotateStart = (e: React.MouseEvent | React.TouchEvent, stickerId: string) => {
    e.stopPropagation();
    isRotatingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isRotatingRef.current) return;
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const stickerElem = document.getElementById(`sticker-${stickerId}`);
      if (!stickerElem) return;

      const rect = stickerElem.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const radians = Math.atan2(clientX - centerX, -(clientY - centerY));
      const degrees = Math.round(radians * (180 / Math.PI));

      setPlacedStickers(prev => prev.map(s => s.id === stickerId ? { ...s, rotation: degrees } : s));
    };

    const handleMouseUp = () => {
      isRotatingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleMouseMove);
      window.removeEventListener("touchend", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleMouseMove);
    window.addEventListener("touchend", handleMouseUp);
  };

  // VẼ BÚT & HÌNH DẠNG (PAINT CANVAS)
  const saveDrawState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) setDrawHistory(prev => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
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

    if (activeTool === "pen") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (activeTool === "highlighter") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor + "60";
      ctx.lineWidth = brushSize * 4;
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
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
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
        ctx.fillStyle = brushColor;
        ctx.fill();
      }
    }
    ctx.beginPath();
  };

  // EXPORT
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
      
      {/* STYLE BACKGROUNDS */}
      <style>{`
        .bg-lined {
          background-color: #fdfbf7;
          background-image: repeating-linear-gradient(transparent, transparent 27px, #e2e8f0 28px);
        }
        .bg-grid {
          background-color: #fdfbf7;
          background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .bg-kraft { background-color: #f5efe6; }
        .bg-white-paper { background-color: #ffffff; }
        .goog-te-gadget-simple {
          background-color: #1e293b !important;
          border: 1px solid #334155 !important;
          padding: 4px 8px !important;
          border-radius: 10px !important;
          color: white !important;
        }
        .goog-te-gadget-simple span { color: white !important; }
        /* Giới hạn chiều cao & thêm thanh cuộn cho Google Translate */
        iframe.goog-te-menu-frame {
          max-height: 350px !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important;
          border-radius: 12px !important;
        }
        .goog-te-menu2 {
          max-height: 350px !important;
          overflow-y: auto !important;
        }
      `}</style>

      {/* HEADER TỰA ĐỀ & CHỌN NGÔN NGỮ GOOGLE TRANSLATE 100+ */}
      <header className="w-full max-w-6xl flex flex-wrap items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-4 gap-3">
        <h1 className="text-xl font-bold text-pink-500 flex items-center gap-2">
          📖 Nhật Ký Sticker & Note Số
        </h1>

        <div className="flex items-center gap-3">
          {/* NÚT TỰ ĐỘNG DỊCH 100+ NGÔN NGỮ */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-xl border border-slate-700">
            <Globe className="w-4 h-4 text-pink-400 shrink-0" />
            <div id="google_translate_element"></div>
          </div>

          <button onClick={exportPNG} className="px-3.5 py-2 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Lưu Ảnh
          </button>
          <button onClick={exportPDF} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center gap-1.5">
            <Printer className="w-4 h-4" /> In A4
          </button>
        </div>
      </header>

      {/* TỔNG HỢP TOOLBAR PHONG CÁCH PAINT / CANVA */}
      <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 p-3 rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* NHÓM BÚT VẼ & CHỌN DỤNG CỤ */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
          <button onClick={() => setActiveTool("select")} className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${activeTool === "select" ? "bg-pink-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}>
            Con Trỏ
          </button>
          <button onClick={() => setActiveTool("pen")} className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${activeTool === "pen" ? "bg-pink-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}>
            <PenTool className="w-3.5 h-3.5" /> Bút Viết
          </button>
          <button onClick={() => setActiveTool("highlighter")} className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${activeTool === "highlighter" ? "bg-amber-400 text-slate-900 font-bold" : "text-slate-400 hover:bg-slate-800"}`}>
            <Highlighter className="w-3.5 h-3.5" /> Dạ Quang
          </button>
          <button onClick={() => setActiveTool("eraser")} className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${activeTool === "eraser" ? "bg-red-500 text-white" : "text-slate-400 hover:bg-slate-800"}`}>
            Tẩy
          </button>
        </div>

        {/* NHÓM HÌNH DẠNG SHAPES (PAINT STYLE) */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-500 px-1">Hình dạng:</span>
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("rect"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "rect" ? "bg-pink-500/20 text-pink-400 border border-pink-500/50" : "text-slate-400"}`}>
            <Square className="w-4 h-4" />
          </button>
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("circle"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "circle" ? "bg-pink-500/20 text-pink-400 border border-pink-500/50" : "text-slate-400"}`}>
            <Circle className="w-4 h-4" />
          </button>
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("line"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "line" ? "bg-pink-500/20 text-pink-400 border border-pink-500/50" : "text-slate-400"}`}>
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={() => { setActiveTool("shape"); setSelectedShape("arrow"); }} className={`p-1.5 rounded-lg ${activeTool === "shape" && selectedShape === "arrow" ? "bg-pink-500/20 text-pink-400 border border-pink-500/50" : "text-slate-400"}`}>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* BẢNG MÀU PHONG PHÚ & KÍCH THƯỚC BÚT */}
        <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
          {["#f43f5e", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#1e293b", "#ffffff"].map((color) => (
            <button
              key={color}
              onClick={() => setBrushColor(color)}
              style={{ backgroundColor: color }}
              className={`w-5 h-5 rounded-full border border-slate-600 transition-transform ${brushColor === color ? "scale-125 ring-2 ring-pink-500" : ""}`}
            />
          ))}
          <input 
            type="color" 
            value={brushColor} 
            onChange={(e) => setBrushColor(e.target.value)}
            className="w-6 h-6 rounded-md border-none cursor-pointer bg-transparent"
          />
          <input 
            type="range" 
            min="1" 
            max="16" 
            value={brushSize} 
            onChange={(e) => setBrushSize(Number(e.target.value))} 
            className="w-16 ml-1"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* PHÔNG CHỮ */}
          <select 
            value={journalFont} 
            onChange={(e) => setJournalFont(e.target.value)}
            className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="font-sans">Chữ Modern</option>
            <option value="font-serif">Chữ Cổ Điển</option>
            <option value="font-mono">Chữ Máy Tính</option>
          </select>

          <button onClick={undoDraw} className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 font-semibold">
            <Undo2 className="w-3.5 h-3.5" /> Hoàn tác
          </button>
        </div>

      </div>

      {/* LAYOUT CHÍNH */}
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-6 items-start">
        
        {/* CỘT TRÁI: KHO STICKER CÁ NHÂN & MẪU SỔ */}
        <div className="w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 flex-shrink-0">
          <h2 className="text-sm font-bold text-pink-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Kho Sticker Cá Nhân
          </h2>

          <div className="space-y-2">
            <button onClick={startCamera} className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" /> Chụp Sticker Mới
            </button>

            <label className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-700">
              <Upload className="w-4 h-4" /> Tải Ảnh Tách Nền...
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <div className="pt-1">
            <p className="text-xs text-slate-400 mb-2">Chạm sticker để dán vào trang sổ:</p>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 min-h-[180px] max-h-[240px] overflow-y-auto grid grid-cols-3 gap-2">
              {myStickers.length === 0 ? (
                <div className="col-span-3 text-center py-8 text-xs text-slate-500">
                  Chưa có sticker. Chụp hoặc tải ảnh lên nhé!
                </div>
              ) : (
                myStickers.map((st) => (
                  <button 
                    key={st.id} 
                    onClick={() => placeStickerToJournal(st.url)}
                    className="aspect-square bg-slate-900 rounded-lg p-1 border border-slate-800 hover:border-pink-500/50 flex items-center justify-center"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={st.url} alt="Sticker" className="w-full h-full object-contain" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* CHỌN MẪU SỔ & TẢI MẪU TỪ PINTEREST */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-slate-400">Mẫu Trang Sổ:</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setPaperBackground("lined")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "lined" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kẻ Ngang</button>
              <button onClick={() => setPaperBackground("grid")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "grid" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kẻ Ô Ly</button>
              <button onClick={() => setPaperBackground("kraft")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "kraft" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Kraft Vintage</button>
              <button onClick={() => setPaperBackground("white")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold border ${paperBackground === "white" ? "border-pink-500 text-pink-400 bg-pink-500/10" : "border-slate-800 text-slate-400"}`}>Trắng Trơn</button>
            </div>

            <label className="w-full mt-2 py-2 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-800/60">
              <ImageIcon className="w-3.5 h-3.5" /> Tải Mẫu Sổ Từ Ảnh (Pinterest)
              <input type="file" accept="image/*" onChange={handleCustomPaperUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* CỘT PHẢI: TRANG SỔ NHẬT KÝ */}
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
              paperBackground === "grid" ? "bg-grid" : 
              paperBackground === "kraft" ? "bg-kraft" : 
              paperBackground === "white" ? "bg-white-paper" : 
              paperBackground === "lined" ? "bg-lined" : ""
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
              />
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white/70 px-2.5 py-1 rounded-lg border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-pink-500" />
                <input 
                  type="date" 
                  value={journalDate} 
                  onChange={(e) => setJournalDate(e.target.value)}
                  className="bg-transparent border-none focus:outline-none"
                />
              </div>
            </div>

            {/* DANH SÁCH CÁC Ô CHỮ TỰ DO (CLICK ĐÂU GÕ ĐÓ, KÉO THẢ TRÊN DÒNG KẺ) */}
            {textNotes.map((note) => (
              <Rnd
                key={note.id}
                default={{ x: note.x, y: note.y, width: 250, height: 40 }}
                bounds="parent"
                enableResizing={false}
                className="group z-20"
              >
                <div className="relative w-full h-full flex items-center">
                  <textarea
                    autoFocus
                    placeholder="Nhập chữ tại đây..."
                    value={note.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTextNotes(prev => prev.map(n => n.id === note.id ? { ...n, text: val } : n));
                    }}
                    className={`w-full bg-transparent border border-dashed border-transparent hover:border-pink-400 focus:border-pink-500 focus:bg-white/50 rounded px-1.5 py-0.5 text-slate-800 focus:outline-none resize-none font-semibold text-sm leading-snug ${journalFont}`}
                    rows={1}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTextNotes(prev => prev.filter(n => n.id !== note.id));
                    }}
                    className="opacity-0 group-hover:opacity-100 absolute -top-2 -right-2 bg-red-500 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center shadow"
                  >
                    ✕
                  </button>
                </div>
              </Rnd>
            ))}
            
            {/* LỚP VẼ CANVAS */}
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
              className={`absolute inset-0 z-10 ${activeTool !== "select" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
            />

            {/* STICKER TRÊN SỔ VỚI NÚT XOAY TRỰC TIẾP TRÊN KHUNG (PAINT STYLE) */}
            {placedStickers.map((st) => (
              <Rnd
                key={st.id}
                id={`sticker-${st.id}`}
                size={{ width: st.width, height: st.height }}
                position={{ x: st.x, y: st.y }}
                onDragStop={(e, d) => {
                  setPlacedStickers(placedStickers.map(s => s.id === st.id ? { ...s, x: d.x, y: d.y } : s));
                }}
                onResizeStop={(e, direction, ref, delta, position) => {
                  setPlacedStickers(placedStickers.map(s => s.id === st.id ? {
                    ...s,
                    width: parseInt(ref.style.width),
                    height: parseInt(ref.style.height),
                    ...position
                  } : s));
                }}
                onClick={() => setSelectedStickerId(st.id)}
                style={{ zIndex: st.zIndex }}
                bounds="parent"
                className={`group relative ${selectedStickerId === st.id ? "ring-2 ring-pink-500 rounded-lg" : ""}`}
              >
                {/* CÁC NÚT ĐIỀU KHIỂN TRÊN KHUNG KHI CHỌN STICKER */}
                {selectedStickerId === st.id && (
                  <>
                    {/* NÚT XOAY TRÒN TRÊN ĐỈNH KHUNG (PAINT / CANVA) */}
                    <div 
                      onMouseDown={(e) => handleRotateStart(e, st.id)}
                      onTouchStart={(e) => handleRotateStart(e, st.id)}
                      className="absolute -top-7 left-1/2 -translate-x-1/2 w-6 h-6 bg-pink-600 hover:bg-pink-500 text-white rounded-full flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing z-30"
                      title="Xoay Sticker"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </div>

                    {/* NÚT XÓA VÀ NÚT TẦNG Ở GÓC DƯỚI */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlacedStickers(placedStickers.filter(s => s.id !== st.id));
                        setSelectedStickerId(null);
                      }}
                      className="absolute -bottom-6 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md text-xs font-bold z-30"
                      title="Xóa"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                )}

                <div style={{ transform: `rotate(${st.rotation}deg)` }} className="w-full h-full relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={st.url} alt="Sticker" className="w-full h-full object-contain pointer-events-none" />
                </div>
              </Rnd>
            ))}
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
                setCropBox({
                  width: parseInt(ref.style.width),
                  height: parseInt(ref.style.height),
                  ...position
                });
              }}
              bounds="parent"
              className="border-2 border-dashed border-pink-400 bg-pink-500/20 rounded-2xl flex items-center justify-center"
            >
              <span className="text-[10px] text-white bg-pink-600/90 px-2 py-0.5 rounded-full font-semibold">
                Kéo góc để thu phóng
              </span>
            </Rnd>
          </div>

          <div className="flex gap-4 mt-6">
            <button onClick={stopCamera} className="px-5 py-2.5 bg-slate-800 text-slate-300 font-semibold rounded-2xl text-sm">Hủy</button>
            <button onClick={captureCameraSticker} className="px-6 py-2.5 bg-pink-600 text-white font-semibold rounded-2xl text-sm flex items-center gap-2">
              <Camera className="w-4 h-4" /> Chụp & Tách Nền AI
            </button>
          </div>
        </div>
      )}

      {/* POPUP LOADING AI */}
      {isProcessingAI && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4 text-white">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-xs w-full text-center space-y-4 shadow-2xl">
            <Sparkles className="w-10 h-10 text-pink-400 animate-spin mx-auto" />
            <p className="font-semibold text-sm">AI Đang Tách Nền Sticker...</p>
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div className="bg-pink-500 h-full transition-all duration-300" style={{ width: `${loadingProgress}%` }} />
            </div>
            <p className="text-xs text-slate-400">{loadingProgress}%</p>
          </div>
        </div>
      )}

    </div>
  );
}