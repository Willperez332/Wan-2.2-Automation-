import React from 'react';

interface Props {
  currentStep: 'upload' | 'analyze' | 'review' | 'generate';
}

const steps = [
  { id: 'upload', label: 'Upload Assets' },
  { id: 'analyze', label: 'Gemini Analysis' },
  { id: 'review', label: 'Clip Review' },
  { id: 'generate', label: 'Wan 2.2 Gen' },
];

export const StepIndicator: React.FC<Props> = ({ currentStep }) => {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative max-w-4xl mx-auto">
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-800 -z-10 rounded"></div>
        <div 
            className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-brand-600 -z-10 transition-all duration-500 rounded"
            style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        ></div>
        
        {steps.map((step, index) => {
          const isActive = index <= currentIndex;
          const isCurrent = step.id === currentStep;
          
          return (
            <div key={step.id} className="flex flex-col items-center gap-2 bg-[#11111b] px-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 font-bold transition-all duration-300
                ${isActive ? 'bg-brand-600 border-brand-500 text-white shadow-[0_0_15px_rgba(20,184,166,0.5)]' : 'bg-dark-800 border-gray-700 text-gray-500'}
                ${isCurrent ? 'scale-110' : ''}
              `}>
                {index + 1}
              </div>
              <span className={`text-xs font-medium ${isActive ? 'text-brand-100' : 'text-gray-600'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
