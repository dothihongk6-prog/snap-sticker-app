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

// Thêm Interface này cho Chữ
interface PlacedText {
  id: string;
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  rotation?: number;
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
  
  // Preload mô hình AI tách nền ngầm để bấm phát ăn ngay
  useEffect(() => {
    import("@imgly/background-removal");
  }, []);
  
  
  // State quản lý chữ và chữ đang được chọn
  const [placedTexts, setPlacedTexts] = useState<PlacedText[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
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
  const [activeTool, setActiveTool] = useState<"select" | "text" | "pen" | "highlighter" | "eraser" | "shape">("select");
  const [selectedShape, setSelectedShape] = useState<"line" | "arrow" | "rect" | "circle" | "star" | "bubble">("rect");
  const [brushColor, setBrushColor] = useState("#f43f5e");
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawHistory, setDrawHistory] = useState<ImageData[]>([]);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

// Hàm click vào trang sổ để tạo Text Box (và tự động bỏ chọn sticker)
  const handleJournalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 1. TỰ ĐỘNG BỎ CHỌN STICKER ĐỂ MẤT KHUNG HỒNG
    setSelectedStickerId(null);

    // 2. CHỈ TẠO TEXT BOX KHI ĐANG CHỌN CÔNG CỤ VĂN BẢN (T)
    if (activeTool !== "text") return;

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

const resizeImageForAI = (input: string | File): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = typeof input === "string" ? input : URL.createObjectURL(input);
    img.onload = () => {
      const MAX_SIZE = 1024;
      let width = img.width;
      let height = img.height;

      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => resolve(blob as Blob), "image/png", 0.9);
    };
  });
};

// 2. Bên trong hàm bấm chọn/tách nền ảnh của bạn:
const handleProcessAI = async (file: File) => {
  setIsProcessingAI(true); // Bật Popup Loading

  try {
    // Dùng API đã import từ @imgly/background-removal
    const optimizedImage = await resizeImageForAI(file);
    const blob = await removeBackground(optimizedImage);

    // Tạo link ảnh đã tách nền để hiển thị
    const resultUrl = URL.createObjectURL(blob);
    
    // ... các code lưu sticker/xử lý tiếp theo của bạn ...
    console.log("AI background removed:", resultUrl);

  } catch (error) {
    console.error("Lỗi tách nền:", error);
  } finally {
    setIsProcessingAI(false); // Tắt Popup Loading
  }
};

    const processAndSaveStickerAI = async (imageDataUrl: string) => {
    setIsProcessingAI(true);

    // Nhường 100ms cho trình duyệt kịp vẽ Pop-up & kích hoạt timer thoại trước
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      // Nén ảnh nhẹ lại trước khi tách để AI chạy xé gió 3-5s
      const optimizedImage = await resizeImageForAI(imageDataUrl);
      const blob = await removeBackground(optimizedImage, {
        model: "isnet_quint8",
      });
      const stickerUrl = URL.createObjectURL(blob);

      setMyStickers((prev) => [
        { id: Date.now().toString(), url: stickerUrl },
        ...prev,
      ]);
    } catch (err) {
      console.error("Lỗi AI tách nền:", err);
      setMyStickers((prev) => [
        { id: Date.now().toString(), url: imageDataUrl },
        ...prev,
      ]);
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

 // --- HÀM XOAY STICKER TỰ DO (CHẠY ĐƯỢC CẢ TRÊN PC LẪN ĐIỆN THOẠI) ---
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
      let clientX = 0;
      let clientY = 0;

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
        prev.map((s) =>
          s.id === stickerId ? { ...s, rotation: Math.round(degrees) } : s
        )
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

  // --- HÀM XOAY CHỮ TỰ DO ---
  const handleRotateTextStart = (
    e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>,
    textId: string
  ) => {
    e.stopPropagation();

    const element = document.getElementById(`text-${textId}`);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;

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

      setPlacedTexts((prev) =>
        prev.map((t) =>
          t.id === textId ? { ...t, rotation: Math.round(degrees) } : t
        )
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
        <button 
          onClick={() => setActiveTool("select")} 
          className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all ${
            activeTool === "select" ? "bg-pink-600 text-white shadow-md" : "text-slate-300 hover:text-white"
          }`}
        >
          Con Trỏ
        </button>

        {/* THÊM NÚT VĂN BẢN MỚI TẠI ĐÂY */}
        <button 
          onClick={() => setActiveTool("text")} 
          className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all ${
            activeTool === "text" ? "bg-pink-600 text-white shadow-md" : "text-slate-300 hover:text-white"
          }`}
        >
          ✍️ Văn Bản
        </button>

        {/* ĐỔI BÚT VIẾT THÀNH BÚT VẼ */}
        <button 
          onClick={() => setActiveTool("pen")} 
          className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all ${
            activeTool === "pen" ? "bg-pink-600 text-white shadow-md" : "text-slate-300 hover:text-white"
          }`}
        >
          <PenTool className="w-3.5 h-3.5" /> Bút Vẽ
        </button>

        <button 
          onClick={() => setActiveTool("highlighter")} 
          className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all ${
            activeTool === "highlighter" ? "bg-pink-600 text-white shadow-md" : "text-slate-300 hover:text-white"
          }`}
        >
          <Highlighter className="w-3.5 h-3.5" /> Dạ Quang
        </button>

        <button 
          onClick={() => setActiveTool("eraser")} 
          className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all ${
            activeTool === "eraser" ? "bg-pink-600 text-white shadow-md" : "text-slate-300 hover:text-white"
          }`}
        >
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

          {/* ================= STICKER TRÊN SỔ (XOAY 360 CANVA + MƯỢT + XÓA) ================= */}
          {placedStickers.map((st) => {
            const isSelected = selectedStickerId === st.id;

            return (
              <Rnd
                key={st.id}
                id={`sticker-${st.id}`}
                size={{ width: st.width, height: st.height }}
                position={{ x: st.x, y: st.y }}
                bounds="parent"
                /* Lưu vị trí khi thả chuột */
                onDragStop={(e, d) => {
                  setPlacedStickers((prev) =>
                    prev.map((s) => (s.id === st.id ? { ...s, x: d.x, y: d.y } : s))
                  );
                }}
                /* Lưu kích thước khi thả chuột */
                onResizeStop={(e, direction, ref, delta, position) => {
                  setPlacedStickers((prev) =>
                    prev.map((s) =>
                      s.id === st.id
                        ? {
                            ...s,
                            width: parseInt(ref.style.width, 10),
                            height: parseInt(ref.style.height, 10),
                            ...position,
                          }
                        : s
                    )
                  );
                }}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setSelectedStickerId(st.id);
                }}
                className={`group z-30 transition-shadow ${
                  isSelected ? "ring-2 ring-pink-500 rounded-xl" : "ring-0"
                }`}
              >
                <div className="relative w-full h-full select-none">
                  {/* THẺ HÌNH ẢNH STICKER (Xoay theo st.rotation) */}
                  <img
                    src={st.url}
                    alt="sticker"
                    style={{ transform: `rotate(${st.rotation || 0}deg)` }}
                    className="w-full h-full object-contain pointer-events-none select-none transition-transform duration-75"
                    draggable={false}
                  />

                  {/* CÁC NÚT ĐIỀU KHIỂN (Chỉ hiện khi nhấp chọn) */}
                  {isSelected && (
                    <>
                      {/* NÚT XOAY 360° KÉO RÊ THEO CHUỘT / CẢM ỨNG */}
                      <button
                        onMouseDown={(e) => handleRotateStart(e, st.id)}
                        onTouchStart={(e) => handleRotateStart(e, st.id)}
                        title="Kéo giữ để xoay tự do"
                        className="absolute -top-5 left-1/2 -translate-x-1/2 bg-pink-500 text-white w-7 h-7 rounded-full shadow-md hover:bg-pink-600 hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-xs z-50 cursor-grab active:cursor-grabbing select-none"
                      >
                        🔄
                      </button>

                      {/* NÚT XÓA STICKER */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlacedStickers((prev) => prev.filter((s) => s.id !== st.id));
                        }}
                        title="Xóa sticker"
                        className="absolute -bottom-3 -right-3 bg-red-500 text-white w-6 h-6 rounded-full shadow-md hover:bg-red-600 hover:scale-110 active:scale-95 transition-all flex items-center justify-center text-xs z-50 cursor-pointer"
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

      {/* POP-UP LOADING CUTE VIBE SNAPSTICKER */}
      {isProcessingAI && <AILoadingModal />}
    </div>
  );
}

// Sub-component Pop-up Loading cực chill & cute
const ALL_MESSAGES = [
  // 🧸 Bình thường, nhẹ nhàng
  "Từ từ nha, đang làm đây.",
  "Gần xong rồi.",
  "Đang xử lý một chút...",
  "Khoan, còn một tí nữa.",
  "Để mình làm nốt đã.",
  "Xíu nữa thôi.",
  "Đang hoàn thiện...",
  "Sắp xong rồi đó.",
  "Chờ mình một chút nhé.",
  "Mình đang làm đây.",

  // 😏 Hơi lầy
  "Đừng giục, đẹp thì phải chờ.",
  "Đang làm, đừng nhìn chằm chằm.",
  "Bình tĩnh, chưa chạy đâu.",
  "Khoan nha, mình đang cắt.",
  "Từ từ, mình có tay nghề mà.",
  "Đang cố làm cho ra hồn đây.",
  "Chờ tí, đoạn này hơi lì.",
  "Sắp có hàng rồi.",
  "Mình biết bạn đang chờ.",
  "Đừng bỏ mình giữa chừng nha.",

  // ✂️ Liên quan trực tiếp đến việc tách nền
  "Đang soi kỹ từng tí một...",
  "Cái nền này hơi lì nhỉ.",
  "Đang cố không cắt lẹm vào ảnh...",
  "Chỗ này phải cắt cẩn thận.",
  "Đang xử lý phần nền đây.",
  "Mình đang tách từng chi tiết.",
  "Có vài chỗ hơi khó cắt.",
  "Đang dọn nốt phần nền.",
  "Để mình làm viền cho đẹp.",
  "Gần sạch nền rồi.",

  // 🧠 AI hơi ngáo
  "Hmm... để mình xem nào.",
  "Đang suy nghĩ rất nghiêm túc.",
  "Mình đang phân tích tình hình.",
  "Khoan... hình như mình hiểu rồi.",
  "À, biết phải làm gì rồi.",
  "Não AI đang hoạt động hết công suất.",
  "Đang cố hiểu cái ảnh này.",
  "Hmm, chỗ này thú vị đấy.",
  "Mình cần nhìn kỹ hơn một chút.",
  "Đang thương lượng với cái nền...",

  // 🐣 Hơi cute nhưng không sến
  "Xíu nha, sắp ra rồi.",
  "Để mình chăm chút thêm tí.",
  "Gần được rồi nè.",
  "Sắp có sticker mới rồi.",
  "Mình làm kỹ một chút nhé.",
  "Còn một bước nhỏ nữa thôi.",
  "Sắp tới rồi.",
  "Chờ mình tí xíu.",
  "Mình đang cố làm thật đẹp.",
  "Gần đến lúc xuất hiện rồi.",

  // 🤨 Hơi troll
  "Ủa, cái nền này dai vậy?",
  "Sao hôm nay cắt khó thế nhỉ.",
  "Đang đánh nhau với cái nền.",
  "Cái ảnh này có vẻ không muốn bị cắt.",
  "Mình với cái nền đang có chút bất đồng.",
  "Đang xử lý drama phía sau ảnh.",
  "Cái nền chưa chịu đầu hàng.",
  "Một cuộc chiến nhỏ đang diễn ra.",
  "Đang thuyết phục cái nền biến mất.",
  "Sắp thắng rồi."
];

function AILoadingModal() {
  const [currentMessage, setCurrentMessage] = useState("");

  useEffect(() => {
    // 1. Tạo bản sao mới của mảng ALL_MESSAGES mỗi lần Modal được mở ra
    let messagePool = [...ALL_MESSAGES].sort(() => Math.random() - 0.5);

    const getNextMessage = () => {
      if (messagePool.length === 0) {
        messagePool = [...ALL_MESSAGES].sort(() => Math.random() - 0.5);
      }
      return messagePool.pop() || "Sắp xong rồi nè...";
    };

    // Hiện câu đầu tiên ngay lập tức
    setCurrentMessage(getNextMessage());

    // 2. Dùng Web Worker Blob để đếm đúng 3s/lần, BẤT CHẤP AI CÓ GỒNG CPU HAY KHÔNG
    const workerCode = `
      let timer = null;
      onmessage = function(e) {
        if (e.data === 'START') {
          timer = setInterval(() => { postMessage('TICK'); }, 3000);
        } else if (e.data === 'STOP') {
          clearInterval(timer);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = () => {
      setCurrentMessage(getNextMessage());
    };

    worker.postMessage("START");

    return () => {
      worker.postMessage("STOP");
      worker.terminate();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all">
      <div className="bg-slate-900/90 border border-pink-500/30 rounded-3xl p-7 max-w-xs w-full text-center shadow-2xl flex flex-col items-center gap-5 relative overflow-hidden">
        
        {/* Mascot nhún nhảy */}
        <div className="relative py-2">
          <span className="absolute -top-1 -left-4 text-lg animate-bounce delay-100">✨</span>
          <span className="absolute top-0 -right-4 text-base animate-pulse">💗</span>
          <span className="absolute -bottom-1 -left-3 text-sm animate-bounce delay-300">✂️</span>

          <div className="w-20 h-20 bg-gradient-to-tr from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center border border-pink-400/30 shadow-inner animate-wiggle">
            <span className="text-4xl hover:scale-110 transition-transform">🧸</span>
          </div>
        </div>

        {/* Text thoại nhảy chuẩn 3s/lần bất chấp lag */}
        <div className="min-h-[52px] flex flex-col items-center justify-center gap-1">
          <h3 className="text-sm font-semibold text-pink-200 animate-pulse">
            Sắp xong rồi nè... ✨
          </h3>
          <p className="text-xs text-slate-300 font-medium transition-all duration-300">
            {currentMessage}
          </p>
        </div>

        {/* Thanh Shimmer running */}
        <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-slate-700/50 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-pink-400 to-transparent w-full animate-shimmer" />
        </div>
      </div>
    </div>
  );
}

