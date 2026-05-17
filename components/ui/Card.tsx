interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  navy?: boolean;
  gold?: boolean;
}

export default function Card({ title, children, className = "", navy, gold }: CardProps) {
  let bgClass = "bg-white";
  let titleColor = "text-gray-800";
  
  if (navy) {
    bgClass = "bg-navy";
    titleColor = "text-gold";
  } else if (gold) {
    bgClass = "bg-gold";
    titleColor = "text-navy";
  }
  
  return (
    <div className={`${bgClass} rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow ${className}`}>
      {title && <h3 className={`font-semibold mb-3 ${titleColor}`}>{title}</h3>}
      {children}
    </div>
  );
}