import { Link } from 'react-router-dom';
import { ArrowRight } from './Icons';

interface Props {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  badge?: string;
}

export default function PageHeader({
  title,
  subtitle,
  backTo = '/',
  backLabel = 'Back to Home',
  badge,
}: Props) {
  return (
    <div className="page-header-wrap">
      <div className="container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to={backTo} className="breadcrumb-link">
            ← {backLabel}
          </Link>
        </nav>
        <div className="page-header-content">
          {badge && <span className="eyebrow">{badge}</span>}
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
