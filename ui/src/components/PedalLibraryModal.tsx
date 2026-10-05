import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Star,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
  Bookmark,
  Check,
  Disc,
  FolderOpen,
  Layers,
  ArrowRight
} from 'lucide-react';
import { PedalInstance, PedalType } from '../types';
import {
  LibraryPedalTemplate,
  getAllLibraryPedals,
  saveUserPedalTemplate,
  deleteUserPedalTemplate,
  toggleFavoritePedal
} from '../utils/pedalLibrary';

interface PedalLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPedalToBoard: (template: LibraryPedalTemplate) => void;
  currentPedals: PedalInstance[];
  onSaveCurrentPedalToLibrary: (pedal: PedalInstance, customName: string, description?: string) => void;
  initialPedalIdToSave?: string | null;
}

type CategoryFilter = 'all' | 'delay' | 'drive' | 'filter' | 'ducker' | 'amp' | 'user' | 'favorites';

export const PedalLibraryModal: React.FC<PedalLibraryModalProps> = ({
  isOpen,
  onClose,
  onAddPedalToBoard,
  currentPedals,
  onSaveCurrentPedalToLibrary,
  initialPedalIdToSave
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'save_active'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addedPedalId, setAddedPedalId] = useState<string | null>(null);

  // State for "Save Active Pedal" tab
  const [selectedPedalToSaveId, setSelectedPedalToSaveId] = useState<string>(
    initialPedalIdToSave || currentPedals[0]?.id || ''
  );
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // React to initialPedalIdToSave when modal is opened from a pedal's save button
  React.useEffect(() => {
    if (initialPedalIdToSave) {
      setSelectedPedalToSaveId(initialPedalIdToSave);
      setActiveTab('save_active');
    }
  }, [initialPedalIdToSave, isOpen]);

  // Refresh trigger for local state
  const [libraryVersion, setLibraryVersion] = useState(0);

  const libraryPedals = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = libraryVersion;
    return getAllLibraryPedals();
  }, [libraryVersion, isOpen]);

  const filteredPedals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return libraryPedals.filter((pedal) => {
      // Category filter
      if (selectedCategory === 'favorites' && !pedal.isFavorite) return false;
      if (selectedCategory === 'user' && pedal.isFactory) return false;
      if (
        selectedCategory !== 'all' &&
        selectedCategory !== 'favorites' &&
        selectedCategory !== 'user' &&
        pedal.category !== selectedCategory
      ) {
        return false;
      }

      // Search query filter
      if (q) {
        const matchesTitle = pedal.title.toLowerCase().includes(q);
        const matchesSubtitle = pedal.subtitle.toLowerCase().includes(q);
        const matchesDesc = pedal.description.toLowerCase().includes(q);
        const matchesType = pedal.type.toLowerCase().includes(q);
        const matchesTags = pedal.tags.some((t) => t.toLowerCase().includes(q));
        return matchesTitle || matchesSubtitle || matchesDesc || matchesType || matchesTags;
      }

      return true;
    });
  }, [libraryPedals, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const handleToggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoritePedal(id);
    setLibraryVersion((v) => v + 1);
  };

  const handleDeleteUserPedal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this custom preset from your library?')) {
      deleteUserPedalTemplate(id);
      setLibraryVersion((v) => v + 1);
    }
  };

  const handleAdd = (template: LibraryPedalTemplate) => {
    onAddPedalToBoard(template);
    setAddedPedalId(template.id);
    setTimeout(() => setAddedPedalId(null), 1500);
  };

  const handleSaveActiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const source = currentPedals.find((p) => p.id === selectedPedalToSaveId);
    if (!source) return;

    const trimmedName = customName.trim() || `${source.title} (Custom)`;
    onSaveCurrentPedalToLibrary(source, trimmedName, customDescription.trim());
    setLibraryVersion((v) => v + 1);
    setSaveSuccessMessage(`Saved "${trimmedName}" to your Pedal Library!`);
    setCustomName('');
    setCustomDescription('');
    setTimeout(() => {
      setSaveSuccessMessage(null);
      setActiveTab('catalog');
      setSelectedCategory('user');
    }, 1200);
  };

  const getCardBorder = (color: string) => {
    switch (color) {
      case 'amber':
        return 'border-amber-500/40 hover:border-amber-400/80 bg-amber-950/10';
      case 'crimson':
      case 'rose':
        return 'border-rose-500/40 hover:border-rose-400/80 bg-rose-950/10';
      case 'cyan':
        return 'border-cyan-500/40 hover:border-cyan-400/80 bg-cyan-950/10';
      case 'gold':
        return 'border-yellow-500/40 hover:border-yellow-400/80 bg-yellow-950/10';
      default:
        return 'border-[#e6af2e]/40 hover:border-[#e6af2e]/80 bg-[#e6af2e]/10';
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'delay':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'drive':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'filter':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'ducker':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'amp':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in font-mono select-none">
      <div className="relative w-full max-w-5xl h-[88vh] bg-[#0c0e14] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-[#11141e] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#e6af2e]/15 border border-[#e6af2e]/40 flex items-center justify-center text-[#e6af2e]">
              <FolderOpen size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-white tracking-wider uppercase">
                  PEDAL & AMPLIFIER LIBRARY
                </h2>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-bold border border-slate-700">
                  {libraryPedals.length} TOTAL PRESETS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Browse modeled hardware stompboxes, tube amplifier voicings, and save your custom dialed presets.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Switcher */}
            <div className="flex bg-[#090b10] p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className={`px-3 py-1 rounded-md transition font-bold flex items-center gap-1.5 ${
                  activeTab === 'catalog'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders size={13} className="text-[#e6af2e]" />
                <span>Pedal Catalog</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('save_active')}
                className={`px-3 py-1 rounded-md transition font-bold flex items-center gap-1.5 ${
                  activeTab === 'save_active'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bookmark size={13} className="text-emerald-400" />
                <span>Save Active Pedal</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              title="Close Library (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab 1: Catalog Browser */}
        {activeTab === 'catalog' ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search and Category Filter Toolbar */}
            <div className="px-6 py-3 bg-[#0d1017] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(
                  [
                    { id: 'all', label: 'All Units' },
                    { id: 'delay', label: 'Delays & Echo' },
                    { id: 'drive', label: 'Overdrives & Fuzz' },
                    { id: 'filter', label: 'Filters & Wah' },
                    { id: 'ducker', label: 'Dynamics & Duck' },
                    { id: 'amp', label: 'Tube Amps & Cabs' },
                    { id: 'favorites', label: '★ Favorites' },
                    { id: 'user', label: 'User Custom' }
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition border ${
                      selectedCategory === cat.id
                        ? 'bg-[#e6af2e] text-slate-950 border-[#e6af2e] shadow-sm'
                        : 'bg-[#121520] text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-64">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pedals, tags, chips..."
                  className="w-full bg-[#121520] border border-slate-800 focus:border-[#e6af2e] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Pedals Grid */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPedals.length === 0 ? (
                <div className="col-span-full py-16 flex flex-col items-center justify-center text-center text-slate-500">
                  <Sliders size={36} className="text-slate-700 mb-3" />
                  <p className="text-sm font-semibold text-slate-300">No pedals match your criteria</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try searching for another keyword or switch category filters.
                  </p>
                </div>
              ) : (
                filteredPedals.map((pedal) => {
                  const borderStyle = getCardBorder(pedal.color);
                  const isJustAdded = addedPedalId === pedal.id;

                  return (
                    <div
                      key={pedal.id}
                      className={`relative rounded-xl border p-4 flex flex-col justify-between transition-all duration-200 shadow-lg ${borderStyle}`}
                    >
                      {/* Top Row: Category badge, Title, and Actions */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`text-[9.5px] uppercase font-bold px-2 py-0.5 rounded border ${getCategoryBadgeClass(
                              pedal.category
                            )}`}
                          >
                            {pedal.category.toUpperCase()}
                          </span>

                          <div className="flex items-center gap-1.5">
                            {/* Favorite Button */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleFavorite(pedal.id, e)}
                              className={`p-1 rounded hover:bg-slate-800/80 transition ${
                                pedal.isFavorite
                                  ? 'text-amber-400'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                              title={pedal.isFavorite ? 'Remove Favorite' : 'Mark as Favorite'}
                            >
                              <Star
                                size={14}
                                className={pedal.isFavorite ? 'fill-amber-400' : ''}
                              />
                            </button>

                            {/* Delete User Pedal Button */}
                            {!pedal.isFactory && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteUserPedal(pedal.id, e)}
                                className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-800/80 transition"
                                title="Delete user preset"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title & Subtitle */}
                        <h3 className="text-sm font-extrabold text-white tracking-wide">
                          {pedal.title}
                        </h3>
                        <p className="text-[11px] text-[#e6af2e] font-semibold mt-0.5">
                          {pedal.subtitle}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                          {pedal.description}
                        </p>
                      </div>

                      {/* Middle: Parameter Specs Pills */}
                      <div className="my-3 pt-2.5 border-t border-slate-800/60 flex flex-wrap gap-1.5 text-[10px]">
                        {Object.entries(pedal.parameters)
                          .slice(0, 4)
                          .map(([paramKey, val]) => (
                            <span
                              key={paramKey}
                              className="px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-300 border border-slate-800"
                            >
                              <span className="text-slate-500 mr-1">{paramKey}:</span>
                              <span className="font-bold text-white">{val}</span>
                            </span>
                          ))}
                        {Object.keys(pedal.parameters).length > 4 && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900/60 text-slate-500 text-[9px]">
                            +{Object.keys(pedal.parameters).length - 4} more
                          </span>
                        )}
                      </div>

                      {/* Bottom Action: Add to Board Button */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {pedal.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] text-slate-500 bg-[#090b10] px-1.5 py-0.5 rounded"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAdd(pedal)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                            isJustAdded
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-[#e6af2e] text-slate-200 hover:text-slate-950 border border-slate-700 hover:border-[#e6af2e]'
                          }`}
                        >
                          {isJustAdded ? (
                            <>
                              <Check size={13} className="stroke-[3]" />
                              <span>Added!</span>
                            </>
                          ) : (
                            <>
                              <Plus size={13} />
                              <span>Add to Board</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Tab 2: Save Active Pedal from Board into Library */
          <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto w-full">
            <div className="bg-[#10131d] border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Bookmark size={16} className="text-emerald-400" />
                  Save Dialed Component to Library
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Freeze your current custom parameters into a reusable pedal preset that will be saved in your library and available across Ableton sessions.
                </p>
              </div>

              {saveSuccessMessage && (
                <div className="p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <Check size={15} />
                  <span>{saveSuccessMessage}</span>
                </div>
              )}

              {currentPedals.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Your active pedal board is currently empty. Add pedals first to save them to your library.
                </div>
              ) : (
                <form onSubmit={handleSaveActiveSubmit} className="space-y-4 text-xs">
                  {/* Select source pedal */}
                  <div>
                    <label className="block text-slate-400 font-bold mb-1.5">
                      Select Pedal / Amp to Save:
                    </label>
                    <select
                      value={selectedPedalToSaveId}
                      onChange={(e) => setSelectedPedalToSaveId(e.target.value)}
                      className="w-full bg-[#171b26] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#e6af2e]"
                    >
                      {currentPedals.map((pedal) => (
                        <option key={pedal.id} value={pedal.id}>
                          {pedal.title} [{pedal.type.toUpperCase()}] ({Object.keys(pedal.parameters).length} knobs)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Preset Name */}
                  <div>
                    <label className="block text-slate-400 font-bold mb-1.5">
                      Preset Title:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. My Heavy Slap Delay or British Chime Crunch"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full bg-[#171b26] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#e6af2e]"
                    />
                  </div>

                  {/* Preset Description */}
                  <div>
                    <label className="block text-slate-400 font-bold mb-1.5">
                      Tone Description (Optional):
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Notes on sweet spots, pairing tips, and sound character..."
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      className="w-full bg-[#171b26] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#e6af2e]"
                    />
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg bg-[#e6af2e] hover:bg-amber-400 text-slate-950 font-bold transition flex items-center gap-1.5 shadow-md"
                    >
                      <Bookmark size={14} />
                      <span>Save to Library</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
