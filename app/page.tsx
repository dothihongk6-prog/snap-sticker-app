"use client";

import React, { useState, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import { 
  Camera, Image as ImageIcon, Type, Edit3, Trash2, Undo2, 
  Download, Printer, Sparkles, RefreshCw, ZoomIn, ZoomOut 
} from "lucide-react";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
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
}

export default function DigitalJournalApp() {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [textNotes, setTextNotes] = useState<TextNote[]>([]);
  const [paperBackground, setPaperBackground] = useState<string>("bg-slate-900");
  
  const [activeTab, setActiveTab] = useState<"camera" | "draw" | "text" | "stickers">("stickers");
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(4);
  const [drawHistory, setDrawHistory] = useState<ImageData[]>([]);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  const [giphySearch, setGiphySearch] = useState("cute");
  const [giphyStickers, setGiphyStickers] = useState<string[]>([]);

  const journalRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const builtinStickers = [
    "https://api.iconify.design/emojione:sparkles.svg",
    "https://api.iconify.design/fluent-emoji:red-heart.svg",
    "https://api.iconify.design/noto:pushpin.svg",
    "https://api.iconify.design/flat-color-icons:bookmark.svg"
  ];

  const fetchGiphyStickers = async (query: string) => {
    try {
      const res = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=sX4mJG1i9yAgu9T26223RIrrP9xaYUUX&q=${encodeURIComponent(query)}&limit=8`);
      const data = await res.json();
      if (data?.data) {
        setGiphyStickers(data.data.map((item: any) => item.images.fixed_height_small.url));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchGiphyStickers("cute"); }, []);

  // XỬ LÝ LƯU LỊCH SỬ VẼ ĐỂ HOÀN TÁC (UNDO)
  const saveDrawState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setDrawHistory(prev => [...prev, data]);
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
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.beginPath();
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
    ctx.strokeStyle = brushColor;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const addSticker = (url: string) => {
    setStickers([
      ...stickers,
      {
        id: Date.now().toString(),
        url,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: stickers.length + 1
      }
    ]);
  };

  const addTextNote = () => {
    const text = prompt("Nhập ghi chú:");
    if (!text) return;
    setTextNotes([...textNotes, { id: Date.now().toString(), text, x: 50, y: 50, color: "#ffffff" }]);
  };

  const exportPNG = async () => {
    if (!journalRef.current) return;
    const canvas = await html2canvas(journalRef.current, { scale: 2 });
    const link = document.createElement("a");
    link.download = "nhat-ky.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-2 sm:p-4 font-sans">
      
      {/* HEADER */}
      <header className="w-full max-w-xl flex items-center justify-between bg-slate-900 p-3 rounded-2xl border border-slate-800 mb-3">
        <h1 className="text-base font-bold text-pink-400 flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> Nhật Ký Sticker
        </h1>
        <div className="flex gap-2">
          <button onClick={exportPNG} className="px-3 py-1.5 bg-pink-600 text-white rounded-xl text-xs font-semibold hover:bg-pink-500">
            Lưu Ảnh
          </button>
        </div>
      </header>

      {/* MÀN HÌNH SỔ NHẬT KÝ */}
      <div 
        ref={journalRef}
        className={`relative w-full max-w-xl h-[500px] rounded-2xl overflow-hidden border-2 border-slate-800 mb-3 transition-colors ${paperBackground}`}
      >
        {/* Lớp Canvas Vẽ Tay */}
        <canvas
          ref={canvasRef}
          width={600}
          height={500}
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseMove={draw}
          onTouchStart={startDrawing}
          onTouchEnd={stopDrawing}
          onTouchMove={draw}
          className={`absolute inset-0 z-10 ${activeTab === "draw" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
        />

        {/* Text Notes */}
        {textNotes.map((note) => (
          <Rnd
            key={note.id}
            default={{ x: note.x, y: note.y, width: 120, height: 40 }}
            className="z-20 border border-transparent hover:border-pink-500 rounded p-1"
          >
            <p style={{ color: note.color }} className="text-sm font-semibold select-none">{note.text}</p>
          </Rnd>
        ))}

        {/* STICKER TƯƠNG TÁC TAY TRỰC TIẾP (KÉO, PHÓNG TO, XOAY) */}
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

      {/* DÂN CÔNG CỤ ĐIỀU KHIỂN SỔ */}
      <div className="w-full max-w-xl bg-slate-900 p-3 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex justify-around border-b border-slate-800 pb-2">
          <button onClick={() => setActiveTab("stickers")} className={`text-xs font-bold ${activeTab === "stickers" ? "text-pink-400" : "text-slate-400"}`}>Kho Sticker</button>
          <button onClick={() => setActiveTab("draw")} className={`text-xs font-bold ${activeTab === "draw" ? "text-pink-400" : "text-slate-400"}`}>Bút Vẽ</button>
          <button onClick={() => setActiveTab("text")} className={`text-xs font-bold ${activeTab === "text" ? "text-pink-400" : "text-slate-400"}`}>Chữ & Nền</button>
        </div>

        {activeTab === "stickers" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Chạm để thêm sticker vào sổ (Sau đó dùng tay kéo/phóng to):</p>
            <div className="flex gap-2">
              {builtinStickers.map((url, i) => (
                <button key={i} onClick={() => addSticker(url)} className="p-1.5 bg-slate-800 rounded-xl hover:bg-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="s" className="w-8 h-8" />
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "draw" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Màu bút:</span>
              <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-6 h-6 rounded border-none" />
            </div>
            <button onClick={undoDraw} className="flex items-center gap-1 text-xs bg-slate-800 px-3 py-1.5 rounded-xl hover:bg-slate-700 text-pink-400 font-semibold">
              <Undo2 className="w-3.5 h-3.5" /> Hoàn Tác (Undo)
            </button>
          </div>
        )}

        {activeTab === "text" && (
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={() => setPaperBackground("bg-slate-900")} className="text-xs px-2.5 py-1 bg-slate-800 rounded-lg text-slate-200">Nền Tối</button>
              <button onClick={() => setPaperBackground("bg-amber-900")} className="text-xs px-2.5 py-1 bg-amber-950 rounded-lg text-amber-200">Giấy Kraft</button>
              <button onClick={() => setPaperBackground("bg-slate-100")} className="text-xs px-2.5 py-1 bg-white text-slate-900 rounded-lg">Trắng</button>
            </div>
            <button onClick={addTextNote} className="px-3 py-1 bg-pink-600 text-white font-semibold rounded-xl text-xs">+ Thêm Chữ</button>
          </div>
        )}
      </div>

    </div>
  );
}