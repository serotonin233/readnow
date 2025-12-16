import React, { useRef, useState } from 'react';

interface FileSelectProps {
  onFileSelected: (file: File) => void;
  onTextSubmit: (text: string) => void;
  isLoading: boolean;
  ocrEngine: 'gemini' | 'tesseract';
  onOcrEngineChange: (engine: 'gemini' | 'tesseract') => void;
}

const FileSelect: React.FC<FileSelectProps> = ({ 
  onFileSelected, 
  onTextSubmit, 
  isLoading, 
  ocrEngine, 
  onOcrEngineChange 
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [inputText, setInputText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      validateAndUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isLoading || activeTab !== 'upload') return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndUpload(file);
    }
  };

  const validateAndUpload = (file: File) => {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExts = ['.pdf', '.docx'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (validTypes.includes(file.type) || validExts.includes(fileExt)) {
      onFileSelected(file);
    } else {
      alert('仅支持 PDF 和 Word (.docx) 格式的文件');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleEngineClick = (e: React.MouseEvent, engine: 'gemini' | 'tesseract') => {
    e.stopPropagation();
    if (!isLoading) {
        onOcrEngineChange(engine);
    }
  };

  const handleTextSubmitClick = () => {
    if (inputText.trim().length === 0) return;
    onTextSubmit(inputText);
  };

  return (
    <div className={`h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all ${isLoading ? 'opacity-80' : ''}`}>
      
      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'upload' ? 'text-indigo-600 bg-indigo-50/50 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          上传文档
        </button>
        <button
          onClick={() => setActiveTab('paste')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'paste' ? 'text-indigo-600 bg-indigo-50/50 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          粘贴文本
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 relative">
        
        {activeTab === 'upload' ? (
          <div 
            className={`h-full border-2 border-dashed rounded-xl flex flex-col justify-center items-center text-center transition-all cursor-pointer group
              ${isLoading ? 'border-slate-300 bg-slate-50 cursor-not-allowed' : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/30'}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => !isLoading && fileInputRef.current?.click()}
          >
             <input 
              type="file" 
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              disabled={isLoading}
            />
            
            <div className="flex flex-col items-center justify-center space-y-4 p-4">
              <div className={`p-4 rounded-full ${isLoading ? 'bg-slate-200' : 'bg-indigo-100 group-hover:bg-indigo-200'} transition-colors`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-8 h-8 ${isLoading ? 'text-slate-400' : 'text-indigo-600'}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-medium text-slate-700">点击或拖拽上传</p>
                <p className="text-sm text-slate-500 mt-2">支持 PDF 和 Word (.docx)</p>
              </div>
            </div>

             {/* OCR 引擎选择器 - 仅在上传模式显示 */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10" onClick={(e) => e.stopPropagation()}>
               <div className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-sm">
                  <button
                      type="button"
                      onClick={(e) => handleEngineClick(e, 'tesseract')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          ocrEngine === 'tesseract' 
                          ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                      本地 OCR (免费)
                  </button>
                  <button
                      type="button"
                      onClick={(e) => handleEngineClick(e, 'gemini')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          ocrEngine === 'gemini' 
                          ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                      Gemini OCR (高精)
                  </button>
               </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col gap-4">
            <textarea
              className="flex-1 w-full p-4 bg-slate-50 border border-slate-200 rounded-lg resize-none outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm leading-relaxed"
              placeholder="请在此处粘贴需要朗读的文本..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            ></textarea>
            <button
              onClick={handleTextSubmitClick}
              disabled={inputText.trim().length === 0}
              className={`w-full py-3 rounded-lg font-semibold text-white transition-all shadow-sm
                ${inputText.trim().length > 0 
                  ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md' 
                  : 'bg-slate-300 cursor-not-allowed'}`}
            >
              确认文本
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default FileSelect;