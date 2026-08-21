"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Camera, Image as ImageIcon, Type, Edit3, Trash2, RotateCw, 
  Layers, Download, Printer, Palette, Sparkles, RefreshCw, ZoomIn, ZoomOut 
} from "lucide-react";
import { removeBackground } from "@imgly/background-removal";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// --- TYPES ---
interface Sticker {
  id: string;
  url: string;
  x: number;
  y: number;
  scale: number;
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
  // State quản lý Nhật Ký
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [textNotes, setTextNotes] = useState<TextNote[]>([]);
  const [paperBackground, setPaperBackground] = useState<string>("bg-grid");
  
  // State Tool (Bút vẽ, Text, Sticker)
  const [activeTab, setActiveTab] = useState<"camera" | "draw" | "text" | "stickers">("stickers");
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushColor, setBrushColor] = useState("#222222");
  const [brushSize, setBrushSize] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [textColor, setTextColor] = useState("#000000");
  const [textFont, setTextFont] = useState("cursive");

  // State Camera & AI Processing
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // State Giphy API (Sticker tự động)
  const [giphySearch, setGiphySearch] = useState("cute");
  const [giphyStickers, setGiphyStickers] = useState<string[]>([]);
  const [isLoadingGiphy, setIsLoadingGiphy] = useState(false);

  // Refs
  const journalRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- KHỦNG STICKER SẴN CÓ (Washi tape, Polaroid...) ---
  const builtinStickers = [
    "https://api.iconify.design/emojione:sparkles.svg",
    "https://api.iconify.design/fluent-emoji:red-heart.svg",
    "https://api.iconify.design/noto:pushpin.svg",
    "https://api.iconify.design/flat-color-icons:bookmark.svg"
  ];

  // --- HÀM TÌM STICKER TỰ ĐỘNG TỪ GIPHY API ---
  const fetchGiphyStickers = async (query: string) => {
    setIsLoadingGiphy(true);
    try {
      // Demo API Key công khai từ Giphy
      const res = await fetch(`https://api.giphy.com/v1/stickers/search?api_key=sX4mJG1i9yAgu9T26223RIrrP9xaYUUX&q=${encodeURIComponent(query)}&limit=10`);
      const data = await res.json();
      if (data?.data) {
        const urls = data.data.map((item: any) => item.images.fixed_height_small.url);
        setGiphyStickers(urls);
      }
    } catch (err) {
      console.error("Lỗi tải Giphy sticker:", err);
    } finally {
      setIsLoadingGiphy(false);
    }
  };

  useEffect(() => {
    fetchGiphyStickers("cute");
  }, []);

  // --- KHỞI TẠO CAMERA VỚI KHUNG NGẮM 4 GÓC ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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

  // --- CHỤP ẢNH & CẮT CROP VÙNG KHUNG NGẮM TRƯỚC Khi TÁCH NỀN AI ---
  const captureAndProcessSticker = async () => {
    if (!videoRef.current) return;

    // 1. Cắt crop ảnh theo khung ngắm trung tâm để AI chạy nhanh x2 x3
    const video = videoRef.current;
    const tempCanvas = document.createElement("canvas");
    const cropSize = 300; // Kích thước khung vuông trung tâm
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

    // 2. Chạy AI Tách nền với Tiến trình Giả lập sinh động
    setIsProcessingAI(true);
    setLoadingProgress(15);
    const interval = setInterval(() => {
      setLoadingProgress(prev => (prev < 85 ? prev + 15 : prev));
    }, 300);

    try {
      const blob = await removeBackground(croppedImageDataUrl);
      const stickerUrl = URL.createObjectURL(blob);
      
      setLoadingProgress(100);
      clearInterval(interval);
      addStickerToJournal(stickerUrl);
    } catch (err) {
      alert("Tách nền thất bại, giữ nguyên ảnh gốc!");
      addStickerToJournal(croppedImageDataUrl);
    } finally {
      setIsProcessingAI(false);
    }
  };

  // --- THÊM STICKER VÀO NHẬT KÝ ---
  const addStickerToJournal = (url: string) => {
    const newSticker: Sticker = {
      id: Date.now().toString(),
      url,
      x: 100 + Math.random() * 50,
      y: 100 + Math.random() * 50,
      scale: 1,
      rotation: 0,
      zIndex: stickers.length + 1
    };
    setStickers([...stickers, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  // --- XỬ LÝ VẼ TAY (CANVAS) ---
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (activeTab !== "draw") return;
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.beginPath();
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

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

  // --- TẠO VĂN BẢN (NOTE) ---
  const addTextNote = () => {
    const text = prompt("Nhập nội dung ghi chú:");
    if (!text) return;
    const newNote: TextNote = {
      id: Date.now().toString(),
      text,
      x: 80,
      y: 120 + textNotes.length * 40,
      color: textColor,
      fontFamily: textFont
    };
    setTextNotes([...textNotes, newNote]);
  };

  // --- XOAY & PHÓNG TO STICKER ---
  const updateStickerTransform = (id: string, deltaScale: number, deltaRotate: number) => {
    setStickers(stickers.map(s => {
      if (s.id === id) {
        return {
          ...s,
          scale: Math.max(0.3, Math.min(3, s.scale + deltaScale)),
          rotation: (s.rotation + deltaRotate) % 360
        };
      }
      return s;
    }));
  };

  // --- TẢI TRANG NHẬT KÝ (EXPORT PNG) ---
  const exportJournalPNG = async () => {
    if (!journalRef.current) return;
    const canvas = await html2canvas(journalRef.current, { scale: 2 });
    const link = document.createElement("a");
    link.download = `nhat-ky-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // --- XUẤT TRANG A4 IN STICKER ---
  const exportPrintableA4 = async () => {
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.setFontSize(16);
    pdf.text("BẢNG IN STICKER NHẬT KÝ (A4)", 20, 20);

    let posX = 20;
    let posY = 30;
    const imgWidth = 40;
    const imgHeight = 40;

    for (let i = 0; i < stickers.length; i++) {
      try {
        pdf.addImage(stickers[i].url, "PNG", posX, posY, imgWidth, imgHeight);
        pdf.rect(posX - 2, posY - 2, imgWidth + 4, imgHeight + 4, "S"); // Khung viền cắt
        posX += imgWidth + 15;
        if (posX > 150) {
          posX = 20;
          posY += imgHeight + 15;
        }
      } catch (e) {
        console.error("Lỗi thêm sticker vào PDF", e);
      }
    }
    pdf.save("danh-sach-sticker-in-A4.pdf");
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-2 sm:p-4 font-sans">
      
      {/* HEADER TỰA ĐỀ */}
      <header className="w-full max-w-xl flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm mb-3">
        <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-500" /> Sổ Nhật Ký Số
        </h1>
        <div className="flex gap-2">
          <button onClick={exportJournalPNG} className="p-2 bg-pink-100 text-pink-600 rounded-xl hover:bg-pink-200 transition text-xs font-semibold flex items-center gap-1">
            <Download className="w-4 h-4" /> Lưu Ảnh
          </button>
          <button onClick={exportPrintableA4} className="p-2 bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition text-xs font-semibold flex items-center gap-1">
            <Printer className="w-4 h-4" /> In A4
          </button>
        </div>
      </header>

      {/* KHU VỰC TRANG SỔ NHẬT KÝ (MAIN CANVAS AREA) */}
      <div 
        ref={journalRef}
        className={`relative w-full max-w-xl h-[520px] bg-white rounded-2xl shadow-md overflow-hidden border-2 border-slate-200 mb-4 transition-all ${paperBackground}`}
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
          className={`absolute inset-0 z-10 ${activeTab === "draw" ? "cursor-crosshair" : "pointer-events-none"}`}
        />

        {/* Các Văn Bản Ghi Chú */}
        {textNotes.map((note) => (
          <div
            key={note.id}
            style={{
              left: note.x,
              top: note.y,
              color: note.color,
              fontFamily: note.fontFamily,
            }}
            className="absolute z-20 cursor-move text-lg font-medium select-none"
          >
            {note.text}
          </div>
        ))}

        {/* Các Sticker Đã Dán */}
        {stickers.map((st) => (
          <div
            key={st.id}
            onClick={() => setSelectedStickerId(st.id)}
            style={{
              left: st.x,
              top: st.y,
              transform: `scale(${st.scale}) rotate(${st.rotation}deg)`,
              zIndex: st.zIndex,
            }}
            className={`absolute cursor-move select-none p-1 transition-transform ${
              selectedStickerId === st.id ? "ring-2 ring-pink-400 border-dashed rounded-lg" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={st.url} alt="Sticker" className="w-20 h-20 object-contain pointer-events-none" />
          </div>
        ))}
      </div>

      {/* THANH CÔNG CỤ TÙY CHỈNH STICKER ĐANG CHỌN */}
      {selectedStickerId && (
        <div className="w-full max-w-xl bg-white p-2 rounded-xl shadow-sm border border-slate-200 mb-3 flex items-center justify-around">
          <span className="text-xs font-semibold text-slate-500">Chỉnh Sticker:</span>
          <button onClick={() => updateStickerTransform(selectedStickerId, 0.1, 0)} className="p-1.5 bg-slate-100 rounded-lg hover:bg-slate-200">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => updateStickerTransform(selectedStickerId, -0.1, 0)} className="p-1.5 bg-slate-100 rounded-lg hover:bg-slate-200">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => updateStickerTransform(selectedStickerId, 0, 45)} className="p-1.5 bg-slate-100 rounded-lg hover:bg-slate-200 flex items-center gap-1 text-xs">
            <RotateCw className="w-4 h-4" /> Xoay
          </button>
          <button 
            onClick={() => {
              setStickers(stickers.filter(s => s.id !== selectedStickerId));
              setSelectedStickerId(null);
            }} 
            className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* THANH ĐIỀU HƯỚNG TÍNH NĂNG (TAB BAR) */}
      <div className="w-full max-w-xl bg-white p-3 rounded-2xl shadow-md border border-slate-200">
        <div className="flex justify-around border-b pb-2 mb-3">
          <button 
            onClick={() => setActiveTab("stickers")} 
            className={`flex items-center gap-1 font-semibold text-sm ${activeTab === "stickers" ? "text-pink-500 border-b-2 border-pink-500" : "text-slate-400"}`}
          >
            <ImageIcon className="w-4 h-4" /> Kho Sticker
          </button>
          <button 
            onClick={() => setActiveTab("draw")} 
            className={`flex items-center gap-1 font-semibold text-sm ${activeTab === "draw" ? "text-pink-500 border-b-2 border-pink-500" : "text-slate-400"}`}
          >
            <Edit3 className="w-4 h-4" /> Bút Vẽ
          </button>
          <button 
            onClick={() => setActiveTab("text")} 
            className={`flex items-center gap-1 font-semibold text-sm ${activeTab === "text" ? "text-pink-500 border-b-2 border-pink-500" : "text-slate-400"}`}
          >
            <Type className="w-4 h-4" /> Chữ & Nền
          </button>
          <button 
            onClick={startCamera} 
            className="flex items-center gap-1 font-semibold text-sm text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl hover:bg-indigo-100"
          >
            <Camera className="w-4 h-4" /> Chụp AI
          </button>
        </div>

        {/* CONTROLS THEO TAB */}
        {/* TAB 1: KHO STICKER (MẪU SẴN + GIPHY TỰ ĐỘNG) */}
        {activeTab === "stickers" && (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">Sticker mẫu cơ bản:</p>
              <div className="flex gap-2">
                {builtinStickers.map((url, idx) => (
                  <button key={idx} onClick={() => addStickerToJournal(url)} className="p-2 border rounded-xl hover:bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="icon" className="w-8 h-8" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex gap-2 mb-2">
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
                  <p className="text-xs text-slate-400">Đang tải sticker mới...</p>
                ) : (
                  giphyStickers.map((url, idx) => (
                    <button key={idx} onClick={() => addStickerToJournal(url)} className="flex-shrink-0 p-1 border rounded-xl hover:bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Giphy" className="w-12 h-12 object-contain" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CÔNG CỤ BÚT VẼ TAY */}
        {activeTab === "draw" && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Màu:</label>
              <input 
                type="color" 
                value={brushColor} 
                onChange={(e) => { setBrushColor(e.target.value); setIsEraser(false); }} 
                className="w-7 h-7 rounded-full cursor-pointer border-none"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs font-semibold text-slate-600">Nét:</label>
              <input 
                type="range" 
                min="1" 
                max="15" 
                value={brushSize} 
                onChange={(e) => setBrushSize(Number(e.target.value))} 
                className="w-20"
              />
            </div>
            <button 
              onClick={() => setIsEraser(!isEraser)} 
              className={`p-2 text-xs rounded-xl font-semibold border ${isEraser ? "bg-red-500 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {isEraser ? "Đang Tẩy" : "Cục Tẩy"}
            </button>
          </div>
        )}

        {/* TAB 3: TÙY CHỈNH CHỮ & NỀN SỔ */}
        {activeTab === "text" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input 
                  type="color" 
                  value={textColor} 
                  onChange={(e) => setTextColor(e.target.value)} 
                  className="w-7 h-7 rounded-full border-none cursor-pointer"
                />
                <select 
                  value={textFont} 
                  onChange={(e) => setTextFont(e.target.value)}
                  className="text-xs p-1.5 border rounded-xl"
                >
                  <option value="cursive">Chữ Viết Tay</option>
                  <option value="sans-serif">Chữ Hiện Đại</option>
                  <option value="monospace">Chữ Máy Tính</option>
                </select>
              </div>
              <button onClick={addTextNote} className="px-3 py-1.5 bg-pink-500 text-white font-semibold rounded-xl text-xs">
                + Thêm Chữ
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">Mẫu giấy sổ nhật ký:</p>
              <div className="flex gap-2">
                <button onClick={() => setPaperBackground("bg-white")} className="text-xs px-2.5 py-1 border rounded-lg bg-white">Trắng</button>
                <button onClick={() => setPaperBackground("bg-slate-50")} className="text-xs px-2.5 py-1 border rounded-lg bg-slate-100">Xám nhạt</button>
                <button onClick={() => setPaperBackground("bg-amber-50")} className="text-xs px-2.5 py-1 border rounded-lg bg-amber-50">Kraft Cổ Điển</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POPUP CAMERA KHUNG NGẮM 4 GÓC */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-sm aspect-square bg-black rounded-3xl overflow-hidden border-2 border-white/20">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            
            {/* KHUNG NGẮM 4 GÓC NHỌN (SCANNER OVERLAY) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[260px] h-[260px] relative">
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
            <button onClick={captureAndProcessSticker} className="px-6 py-2.5 bg-pink-500 text-white font-semibold rounded-2xl text-sm shadow-lg flex items-center gap-2">
              <Camera className="w-4 h-4" /> Chụp & Tách Nền AI
            </button>
          </div>
        </div>
      )}

      {/* POPUP MÀN HÌNH CHỜ AI XỬ LÝ (PROGRESS BAR) */}
      {isProcessingAI && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4 text-white">
          <div className="bg-slate-900 p-6 rounded-3xl max-w-xs w-full text-center space-y-4">
            <Sparkles className="w-10 h-10 text-pink-400 animate-spin mx-auto" />
            <p className="font-semibold text-sm">Đang Tách Nền AI Tối Ưu...</p>
            <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-pink-500 h-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">{loadingProgress}%</p>
          </div>
        </div>
      )}

    </div>
  );
}