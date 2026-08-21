"use client";

import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { 
  Camera, Image as ImageIcon, Type, Edit3, Trash2, Undo2, 
  Download, Printer, Sparkles, RefreshCw, Grid, FileText, Upload
} from "lucide-react";
import { removeBackground } from "@imgly/background-removal";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface Sticker {
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
  color: string;
  fontFamily: string;
}

export default function DigitalJournalApp() {
  // --- STATES ---
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [textNotes, setTextNotes] = useState<TextNote[]>([]);
  const [paperBackground, setPaperBackground] = useState<"grid" | "lined" | "kraft" | "white">("grid");
  
  // Tabs: stickers | draw | text | background
  const [activeTab, setActiveTab] = useState<"stickers" | "draw" | "text" | "background">("stickers");
  
  // Bút vẽ (Apple Notes Style)
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState("#2b2b2b");
  const [brushSize, setBrushSize] = useState(3);
  const [isEraser, setIsEraser] = useState(false);
  const [drawHistory, setDrawHistory] = useState<ImageData[]>([]);

  // Text Tool
  const [textColor, setTextColor] = useState("#1e293b");
  const [textFont, setTextFont] = useState("cursive");

  // Camera & AI
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Sticker Giphy API
  const [giphySearch, setGiphySearch] = useState("cute");
  const [giphyStickers, setGiphyStickers] = useState<string[]>([]);
  const [isLoadingGiphy, setIsLoadingGiphy] = useState(false);

  // Refs
  const journalRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const builtinStickers = [
    "https://api.iconify.design/emojione:sparkles.svg",
    "https://api.iconify.design/fluent-emoji:red-heart.svg",
    "https://api.iconify.design/noto:pushpin.svg",
    "https://api.iconify.design/flat-color-icons:bookmark.svg"
  ];

  // Fetch Giphy
  const fetchGiphyStickers = async (query: string) => {
    setIsLoadingGiphy(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=sX4mJG1i9yAgu9T26223RIrrP9xaYUUX&q=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      if (data?.data) {
        setGiphyStickers(data.data.map((item: any) => item.images.fixed_height_small.url));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingGiphy(false);
    }
  };

  useEffect(() => { fetchGiphyStickers("cute"); }, []);

  // --- CAMERA & AI REMOVE BACKGROUND ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 }
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Không thể truy cập Camera!");
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsCameraOpen(false);
  };

  const captureAndProcessSticker = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const tempCanvas = document.createElement("canvas");
    const cropSize = 300;
    tempCanvas.width = cropSize;
    tempCanvas.height = cropSize;
    const ctx = tempCanvas.getContext("2d");

    if (ctx) {
      const startX = (video.videoWidth - cropSize) / 2;
      const startY = (video.videoHeight - cropSize) / 2;
      ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, cropSize, cropSize);
    }

    const croppedImageDataUrl = tempCanvas.toDataURL("image/png");
    stopCamera();

    setIsProcessingAI(true);
    setLoadingProgress(20);
    const interval = setInterval(() => {
      setLoadingProgress(prev => (prev < 85 ? prev + 15 : prev));
    }, 250);

    try {
      const blob = await removeBackground(croppedImageDataUrl);
      const stickerUrl = URL.createObjectURL(blob);
      setLoadingProgress(100);
      clearInterval(interval);
      addSticker(stickerUrl);
    } catch (err) {
      addSticker(croppedImageDataUrl);
    } finally {
      setIsProcessingAI(false);
    }
  };

  // Up ảnh từ máy
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          addSticker(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- STICKER MANIPULATION ---
  const addSticker = (url: string) => {
    const newSticker: Sticker = {
      id: Date.now().toString(),
      url,
      x: 60,
      y: 60,
      width: 110,
      height: 110,
      rotation: 0,
      zIndex: stickers.length + 1
    };
    setStickers([...stickers, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  // --- DRAWING CANVAS (HOÀN TÁC UNDO) ---
  const saveDrawState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        setDrawHistory(prev => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
      }
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
        if (newHistory.length > 0) {
          ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
        }
      }
    }
  };

  const startDrawing = (e: any) => {
    if (activeTab !== "draw") return;
    saveDrawState();
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    canvasRef.current?.getContext("2d")?.beginPath();
  };

  const draw = (e: any) => {
    if (!isDrawing || activeTab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";

    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  // --- TEXT NOTE ---
  const addTextNote = () => {
    const text = prompt("Nhập nội dung ghi chú:");
    if (!text) return;
    setTextNotes([...textNotes, {
      id: Date.now().toString(),
      text,
      x: 80,
      y: 80,
      color: textColor,
      fontFamily: textFont
    }]);
  };

  // --- EXPORT PNG / PDF ---
  const exportPNG = async () => {
    if (!journalRef.current) return;
    const canvas = await html2canvas(journalRef.current, { scale: 2 });
    const link = document.createElement("a");
    link.download = `nhat-ky-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const exportPDF = async () => {
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.setFontSize(16);
    pdf.text("BẢNG IN STICKER A4", 20, 20);

    let posX = 20;
    let posY = 30;
    for (let i = 0; i < stickers.length; i++) {
      try {
        pdf.addImage(stickers[i].url, "PNG", posX, posY, 40, 40);
        pdf.rect(posX - 2, posY - 2, 44, 44, "S");
        posX += 55;
        if (posX > 150) {
          posX = 20;
          posY += 55;
        }
      } catch (e) {}
    }
    pdf.save("sticker-A4.pdf");
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-2 sm:p-4 font-sans text-slate-800">
      
      {/* STYLE CSS NỀN GIẤY KẺ Ô LY & KẺ NGANG */}
      <style jsx global>{`
        .bg-grid {
          background-color: #fcfcf9;
          background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px);
          background-size: 20px 20px;
        }
        .bg-lined {
          background-color: #fcfcf9;
          background-image: repeating-linear-gradient(transparent, transparent 27px, #cbd5e1 28px);
        }
        .bg-kraft {
          background-color: #f5efe6;
        }
        .bg-white-paper {
          background-color: #ffffff;
        }
      `}</style>

      {/* HEADER TỰA ĐỀ */}
      <header className="w-full max-w-xl flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm mb-3 border border-slate-200">
        <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-500" /> Sổ Nhật Ký Số
        </h1>
        <div className="flex gap-2">
          <button onClick={exportPNG} className="px-3 py-1.5 bg-pink-500 text-white rounded-xl text-xs font-semibold hover:bg-pink-600 shadow-sm flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> Lưu Ảnh
          </button>
          <button onClick={exportPDF} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-semibold hover:bg-indigo-100 flex items-center gap-1">
            <Printer className="w-3.5 h-3.5" /> In A4
          </button>
        </div>
      </header>

      {/* MÀN HÌNH SỔ NHẬT KÝ (GIẤY KẺ Ô LY CHUẨN APP NOTES) */}
      <div 
        ref={journalRef}
        className={`relative w-full max-w-xl h-[520px] rounded-2xl overflow-hidden border-2 border-slate-300 shadow-inner mb-3 transition-all ${
          paperBackground === "grid" ? "bg-grid" : 
          paperBackground === "lined" ? "bg-lined" : 
          paperBackground === "kraft" ? "bg-kraft" : "bg-white-paper"
        }`}
      >
        {/* Lớp Canvas Vẽ Tay */}
        <canvas
          ref={canvasRef}
          width={600}
          height={520}
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseMove={draw}
          onTouchStart={startDrawing}
          onTouchEnd={stopDrawing}
          onTouchMove={draw}
          className={`absolute inset-0 z-10 ${activeTab === "draw" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
        />

        {/* Text Notes (Đen / Màu tùy chỉnh) */}
        {textNotes.map((note) => (
          <Rnd
            key={note.id}
            default={{ x: note.x, y: note.y, width: 140, height: 40 }}
            className="z-20 border border-transparent hover:border-pink-400 rounded"
          >
            <p style={{ color: note.color, fontFamily: note.fontFamily }} className="text-base font-semibold select-none leading-snug">
              {note.text}
            </p>
          </Rnd>
        ))}

        {/* STICKER TƯƠNG TÁC TAY TRỰC TIẾP */}
        {stickers.map((st) => (
          <Rnd
            key={st.id}
            size={{ width: st.width, height: st.height }}
            position={{ x: st.x, y: st.y }}
            onDragStop={(e, d) => {
              setStickers(stickers.map(s => s.id === st.id ? { ...s, x: d.x, y: d.y } : s));
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
              setStickers(stickers.map(s => s.id === st.id ? {
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
            <div style={{ transform: `rotate(${st.rotation}deg)` }} className="w-full h-full relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={st.url} alt="Sticker" className="w-full h-full object-contain pointer-events-none" />
            </div>
          </Rnd>
        ))}
      </div>

      {/* TÙY CHỈNH STICKER ĐANG CHỌN (XOAY & XÓA) */}
      {selectedStickerId && (
        <div className="w-full max-w-xl bg-white p-2 rounded-xl shadow-sm border border-slate-200 mb-2 flex items-center justify-between px-4">
          <span className="text-xs font-semibold text-slate-500">Đang chọn Sticker:</span>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setStickers(stickers.map(s => s.id === selectedStickerId ? { ...s, rotation: (s.rotation + 45) % 360 } : s));
              }} 
              className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-lg font-semibold"
            >
              Xoay 45°
            </button>
            <button 
              onClick={() => {
                setStickers(stickers.filter(s => s.id !== selectedStickerId));
                setSelectedStickerId(null);
              }} 
              className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1 rounded-lg font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Xóa
            </button>
          </div>
        </div>
      )}

      {/* THANH ĐIỀU HƯỚNG TÍNH NĂNG CHÍNH (TAB BAR) */}
      <div className="w-full max-w-xl bg-white p-3 rounded-2xl shadow-md border border-slate-200 space-y-3">
        
        {/* NÚT CHỤP / UP ẢNH & DANH SÁCH TAB */}
        <div className="flex justify-between items-center border-b pb-2">
          <div className="flex gap-3">
            <button onClick={() => setActiveTab("stickers")} className={`text-xs font-bold ${activeTab === "stickers" ? "text-pink-500 border-b-2 border-pink-500 pb-1" : "text-slate-400"}`}>
              Kho Sticker
            </button>
            <button onClick={() => setActiveTab("draw")} className={`text-xs font-bold ${activeTab === "draw" ? "text-pink-500 border-b-2 border-pink-500 pb-1" : "text-slate-400"}`}>
              Bút Vẽ
            </button>
            <button onClick={() => setActiveTab("text")} className={`text-xs font-bold ${activeTab === "text" ? "text-pink-500 border-b-2 border-pink-500 pb-1" : "text-slate-400"}`}>
              Chữ
            </button>
            <button onClick={() => setActiveTab("background")} className={`text-xs font-bold ${activeTab === "background" ? "text-pink-500 border-b-2 border-pink-500 pb-1" : "text-slate-400"}`}>
              Mẫu Sổ
            </button>
          </div>

          {/* CHỤP AI & UP ẢNH */}
          <div className="flex gap-1.5">
            <label className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer text-xs font-semibold flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
            <button onClick={startCamera} className="px-2.5 py-1 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> Chụp AI
            </button>
          </div>
        </div>

        {/* TAB 1: KHO STICKER */}
        {activeTab === "stickers" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {builtinStickers.map((url, idx) => (
                <button key={idx} onClick={() => addSticker(url)} className="p-1.5 border rounded-xl hover:bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="icon" className="w-7 h-7" />
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                value={giphySearch} 
                onChange={(e) => setGiphySearch(e.target.value)} 
                placeholder="Tìm sticker hot (VD: cat, love...)"
                className="w-full text-xs p-2 border rounded-xl focus:outline-none focus:ring-1 focus:ring-pink-400"
              />
              <button onClick={() => fetchGiphyStickers(giphySearch)} className="px-3 bg-pink-500 text-white rounded-xl text-xs font-semibold">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {isLoadingGiphy ? (
                <p className="text-xs text-slate-400">Đang tải sticker...</p>
              ) : (
                giphyStickers.map((url, idx) => (
                  <button key={idx} onClick={() => addSticker(url)} className="flex-shrink-0 p-1 border rounded-xl hover:bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Giphy" className="w-10 h-10 object-contain" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: BÚT VẼ (CÔNG CỤ GIỐNG APPLE NOTES) */}
        {activeTab === "draw" && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Màu bút:</label>
              <input 
                type="color" 
                value={brushColor} 
                onChange={(e) => { setBrushColor(e.target.value); setIsEraser(false); }} 
                className="w-7 h-7 rounded-full border-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Nét:</label>
              <input 
                type="range" 
                min="1" 
                max="12" 
                value={brushSize} 
                onChange={(e) => setBrushSize(Number(e.target.value))} 
                className="w-20"
              />
            </div>

            <button 
              onClick={() => setIsEraser(!isEraser)} 
              className={`px-2.5 py-1 text-xs rounded-xl font-semibold border ${isEraser ? "bg-red-500 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {isEraser ? "Đang Tẩy" : "Tẩy"}
            </button>

            <button onClick={undoDraw} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-xl hover:bg-slate-200 font-semibold">
              <Undo2 className="w-3.5 h-3.5" /> Hoàn tác
            </button>
          </div>
        )}

        {/* TAB 3: TÙY CHỈNH CHỮ (CHỮ ĐEN CHUẨN) */}
        {activeTab === "text" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Màu chữ:</label>
              <input 
                type="color" 
                value={textColor} 
                onChange={(e) => setTextColor(e.target.value)} 
                className="w-7 h-7 rounded-full border-none cursor-pointer"
              />
              <select 
                value={textFont} 
                onChange={(e) => setTextFont(e.target.value)}
                className="text-xs p-1.5 border rounded-xl bg-white text-slate-800"
              >
                <option value="cursive">Chữ Viết Tay</option>
                <option value="sans-serif">Chữ In Hiện Đại</option>
                <option value="monospace">Chữ Máy Tính</option>
              </select>
            </div>
            <button onClick={addTextNote} className="px-3 py-1.5 bg-pink-500 text-white font-semibold rounded-xl text-xs">
              + Nhập Chữ
            </button>
          </div>
        )}

        {/* TAB 4: MẪU SỔ NHẬT KÝ */}
        {activeTab === "background" && (
          <div className="flex gap-2 justify-around">
            <button onClick={() => setPaperBackground("grid")} className={`text-xs px-3 py-1.5 rounded-xl border font-semibold flex items-center gap-1 ${paperBackground === "grid" ? "bg-pink-500 text-white" : "bg-slate-50 text-slate-700"}`}>
              <Grid className="w-3.5 h-3.5" /> Kẻ Ô Ly
            </button>
            <button onClick={() => setPaperBackground("lined")} className={`text-xs px-3 py-1.5 rounded-xl border font-semibold flex items-center gap-1 ${paperBackground === "lined" ? "bg-pink-500 text-white" : "bg-slate-50 text-slate-700"}`}>
              <FileText className="w-3.5 h-3.5" /> Kẻ Ngang
            </button>
            <button onClick={() => setPaperBackground("kraft")} className={`text-xs px-3 py-1.5 rounded-xl border font-semibold ${paperBackground === "kraft" ? "bg-pink-500 text-white" : "bg-amber-100 text-amber-900"}`}>
              Kraft Cổ Điển
            </button>
            <button onClick={() => setPaperBackground("white")} className={`text-xs px-3 py-1.5 rounded-xl border font-semibold ${paperBackground === "white" ? "bg-pink-500 text-white" : "bg-white text-slate-700"}`}>
              Trắng Trơn
            </button>
          </div>
        )}

      </div>

      {/* POPUP CAMERA SCAN */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden border-2 border-white/20">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[250px] h-[250px] relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-pink-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-pink-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-pink-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-pink-400 rounded-br-lg" />
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <button onClick={stopCamera} className="px-5 py-2.5 bg-slate-600 text-white font-semibold rounded-2xl text-sm">
              Hủy
            </button>
            <button onClick={captureAndProcessSticker} className="px-6 py-2.5 bg-pink-500 text-white font-semibold rounded-2xl text-sm flex items-center gap-2">
              <Camera className="w-4 h-4" /> Chụp & Tách Nền AI
            </button>
          </div>
        </div>
      )}

      {/* POPUP LOADING PROGRESS AI */}
      {isProcessingAI && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4 text-white">
          <div className="bg-slate-900 p-6 rounded-3xl max-w-xs w-full text-center space-y-4">
            <Sparkles className="w-10 h-10 text-pink-400 animate-spin mx-auto" />
            <p className="font-semibold text-sm">Đang Tách Nền AI...</p>
            <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div className="bg-pink-500 h-full transition-all duration-300" style={{ width: `${loadingProgress}%` }} />
            </div>
            <p className="text-xs text-slate-400">{loadingProgress}%</p>
          </div>
        </div>
      )}

    </div>
  );
}