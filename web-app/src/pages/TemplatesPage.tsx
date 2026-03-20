import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type Category = 'all' | 'website' | 'api' | 'cli' | 'bot' | 'data' | 'other';

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'website', label: 'Website' },
  { key: 'api', label: 'API' },
  { key: 'cli', label: 'CLI' },
  { key: 'bot', label: 'Bot' },
  { key: 'data', label: 'Data' },
  { key: 'other', label: 'Other' },
];

function formatTemplateName(name: string): string {
  return name
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<Category>('all');

  const fetchTemplates = useCallback(() => api.getTemplates(), []);
  const { data: templates } = usePolling(fetchTemplates, 60000, true);

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (activeCategory === 'all') return templates;
    return templates.filter((t) => (t.category || 'other') === activeCategory);
  }, [templates, activeCategory]);

  const handleSelect = (filename: string) => {
    sessionStorage.setItem('pl_template', filename);
    navigate('/');
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <h1 className="font-heading text-h1 text-[#36342E] mb-6">Templates</h1>

      {/* Category filters */}
      <div className="flex items-center gap-1 mb-6" role="tablist">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            role="tab"
            aria-selected={activeCategory === cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-colors ${
              activeCategory === cat.key
                ? 'bg-[#553DE9] text-white'
                : 'text-[#6B6960] hover:text-[#36342E] hover:bg-[#F8F4F0]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {!templates ? (
        <p className="text-sm text-[#6B6960]">Loading templates...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#6B6960] py-12 text-center">No templates in this category.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            return (
              <Card key={t.filename} hover onClick={() => handleSelect(t.filename)}>
                <div className="mb-2">
                  <Badge status="version">{t.category || 'other'}</Badge>
                </div>
                <h3 className="text-sm font-medium text-[#36342E] mb-1">
                  {formatTemplateName(t.name)}
                </h3>
                <p className="text-xs text-[#6B6960]">{t.filename}</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
