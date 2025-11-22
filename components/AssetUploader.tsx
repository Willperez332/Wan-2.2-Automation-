import React from 'react';

interface Props {
  label: string;
  subLabel: string;
  accept: string;
  file: File | null;
  onUpload: (file: File) => void;
  icon: React.ReactNode;
}

export const AssetUploader: React.FC<Props> = ({ label, subLabel, accept, file, onUpload, icon }) => {
  return (
    <div className="relative group">
      <div className={`
        border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer
        ${file 
          ? 'border-brand-500/50 bg-brand-900/10' 
          : 'border-gray-700 bg-dark-800 hover:border-gray-600 hover:bg-dark-800/80'
        }
      `}>
        <input 
          type="file" 
          accept={accept}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              onUpload(e.target.files[0]);
            }
          }}
        />
        
        <div className={`mb-4 transition-colors duration-300 ${file ? 'text-brand-400' : 'text-gray-500 group-hover:text-gray-400'}`}>
          {icon}
        </div>
        
        <h3 className="text-lg font-medium text-white mb-1">{file ? file.name : label}</h3>
        <p className="text-sm text-gray-500">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : subLabel}</p>
        
        {file && (
          <div className="absolute top-2 right-2">
            <span className="flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
