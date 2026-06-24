import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Tv, 
  Search, 
  Compass, 
  Navigation, 
  Star, 
  Phone, 
  MapPin, 
  ExternalLink, 
  RefreshCw, 
  Sparkles, 
  Utensils, 
  AlertCircle, 
  Map, 
  ChevronRight,
  SlidersHorizontal
} from "lucide-react";
import { Restaurant, GeocodeResult } from "./types";
import { TV_RESTAURANTS_DB } from "./restaurantsData";


// Haversine formula to calculate distance in km
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function App() {
  // --- States ---
  const [restaurants, setRestaurants] = useState<Restaurant[]>(TV_RESTAURANTS_DB.slice(0, 9));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [locationName, setLocationName] = useState<string>("서울 마포구 망원동");

  // Gemini AI Status States
  const [hasServerApiKey, setHasServerApiKey] = useState<boolean>(false);
  const [serverKeyPrefix, setServerKeyPrefix] = useState<string | null>(null);
  const [isGeminiActive, setIsGeminiActive] = useState<boolean>(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem("user_gemini_api_key") || "";
  });
  const [favoriteStyle, setFavoriteStyle] = useState<string>(() => {
    return localStorage.getItem("user_favorite_style") || "";
  });

  // Location Positioning States for sorting and center references
  const [centerLat, setCenterLat] = useState<number>(37.5562); // Default 망원동 Area
  const [centerLng, setCenterLng] = useState<number>(126.9015);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  // Search text & Autocomplete suggestions
  const [searchText, setSearchText] = useState<string>("");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState<boolean>(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState<boolean>(false);
  const [showFiltersMobile, setShowFiltersMobile] = useState<boolean>(false);

  // Filters State
  const [selectedShow, setSelectedShow] = useState<string>("All");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"distance" | "rating" | "name">("distance");

  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // --- Fetch suggestions from Nominatim ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchText.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      setSuggestionsLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchText
          )}&format=json&limit=5&accept-language=ko&countrycodes=kr`
        );
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error("Nominatim suggestion search fail:", err);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [searchText]);

  // Click outside suggestions watcher
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Core API fetch call ---
  const fetchTVRestaurants = async (params: { query?: string; latitude?: number; longitude?: number; force?: boolean }) => {
    setLoading(true);
    setError(null);
    setSelectedRestaurant(null);
    setGeminiError(null);
    
    const displayQuery = params.query 
      ? `'${params.query}' 주변` 
      : `내 GPS 위치 주변 (${params.latitude?.toFixed(4)}, ${params.longitude?.toFixed(4)})`;
    
    setStatusMessage(`${displayQuery}의 방송 맛집 데이터 검색 중...`);

    try {
      const response = await fetch("/api/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          geminiApiKey: customApiKey.trim() || undefined,
          favoriteStyle: favoriteStyle.trim() || undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "맛집 데이터를 불러오는데 실패했습니다.");
      }

      const data = await response.json();
      
      const list = data.restaurants || [];
      setRestaurants(list);
      setLocationName(data.locationName || params.query || "검색 위치 주변");
      setIsGeminiActive(!!data.isGeminiActive);
      setGeminiError(data.geminiError || null);

      // Handle Map centering
      if (list.length > 0) {
        // Center the map on the first restaurant coordinate as base
        // Or if user provided coordinates, center on those coordinates!
        if (params.latitude && params.longitude) {
          setCenterLat(params.latitude);
          setCenterLng(params.longitude);
        } else {
          // average coordinates or first center index
          setCenterLat(list[0].latitude);
          setCenterLng(list[0].longitude);
        }
      } else {
        if (params.latitude && params.longitude) {
          setCenterLat(params.latitude);
          setCenterLng(params.longitude);
        }
        setError("해당 구역의 TV 맛집 데이터를 조회하지 못했습니다. 다른 위치나 넓은 주소로 다시 검색해 보세요.");
      }
    } catch (err: any) {
      console.error(err);
      setError("맛집 데이터를 불러오는데 실패했습니다. (원인: " + (err.message || "연결 불가") + ") 인접 지역으로 검색해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // --- Search actions ---
  const handleQuerySearch = (queryStr: string) => {
    if (!queryStr.trim()) return;
    setSuggestionsOpen(false);
    fetchTVRestaurants({ query: queryStr });
  };

  const handleSuggestionClick = (suggestion: GeocodeResult) => {
    setSearchText(suggestion.display_name);
    setSuggestionsOpen(false);
    
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);
    
    setCenterLat(lat);
    setCenterLng(lon);
    
    // Search restaurants around these exact geocoded coordinates!
    fetchTVRestaurants({ 
      query: suggestion.display_name,
      latitude: lat,
      longitude: lon 
    });
  };

  // --- Trigger Geolocation Search ---
  const handleGeolocationClick = () => {
    if (!navigator.geolocation) {
      setError("죄송합니다. 사용하시는 브라우저에서는 GPS 성능이 지원되지 않습니다.");
      return;
    }

    setLoading(true);
    setStatusMessage("스마트폰/PC 브라우저 실시간 GPS 좌표 획득 중...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setUserLat(lat);
        setUserLng(lon);
        setCenterLat(lat);
        setCenterLng(lon);
        
        // Search
        fetchTVRestaurants({ latitude: lat, longitude: lon });
      },
      (err) => {
        setLoading(false);
        console.error("Geolocation Fetch failure:", err);
        setError("GPS 내 위치 수집 동의가 필요합니다. 브라우저 위치 권한을 승인해 주시거나 검색창에 직접 주소를 입력해 주십시오.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // --- Initial loading on Mount ---
  const fetchKeyStatus = async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setHasServerApiKey(!!data.hasServerApiKey);
        setServerKeyPrefix(data.keyPrefix || null);
      }
    } catch (err) {
      console.error("Failed to fetch API key status:", err);
    }
  };

  useEffect(() => {
    fetchKeyStatus();
    // Show 망원동 first as premium default recommendation
    fetchTVRestaurants({ query: "서울 망원동" });
  }, []);

  // --- Filter and Sort computations ---
  const availableShows = ["All", ...Array.from(new Set(restaurants.map((r) => {
    if (r.tvShow.includes("또간집")) return "풍자 또간집";
    if (r.tvShow.includes("흑백요리사")) return "흑백요리사";
    if (r.tvShow.includes("수요미식회")) return "수요미식회";
    if (r.tvShow.includes("3대천왕") || r.tvShow.includes("3대 천왕")) return "백종원의 3대천왕";
    if (r.tvShow.includes("달인")) return "생활의 달인";
    if (r.tvShow.includes("맛있는 녀석들")) return "맛있는 녀석들";
    if (r.tvShow.includes("백반기행")) return "식객 허영만의 백반기행";
    if (r.tvShow.includes("먹을텐데")) return "성시경의 먹을텐데";
    if (r.tvShow.includes("줄 서는 식당") || r.tvShow.includes("줄서는식당")) return "줄 서는 식당";
    if (r.tvShow.includes("전지적 참견") || r.tvShow.includes("전참시")) return "전지적 참견 시점";
    if (r.tvShow.includes("놀라운 토요일") || r.tvShow.includes("놀토")) return "놀라운 토요일";
    if (r.tvShow.includes("생생정보")) return "생생정보통";
    if (r.tvShow.includes("오늘 뭐 먹지")) return "오늘 뭐 먹지?";
    if (r.tvShow.includes("최자로드")) return "최자로드";
    if (r.tvShow.includes("홍석천")) return "홍석천 이원일";
    if (r.tvShow.includes("천하제빵") || r.tvShow.includes("베이커리")) return "천하제빵 / 베이커리";
    return r.tvShow;
  })))];

  const availableCategories = ["All", ...Array.from(new Set(restaurants.map((r) => r.category)))];

  const filteredRestaurants = restaurants.filter((r) => {
    const showMatch = selectedShow === "All" || 
      r.tvShow.includes(selectedShow) || 
      (selectedShow === "백종원의 3대천왕" && r.tvShow.includes("3대천왕")) ||
      (selectedShow === "풍자 또간집" && r.tvShow.includes("또간집")) ||
      (selectedShow === "식객 허영만의 백반기행" && r.tvShow.includes("백반기행")) ||
      (selectedShow === "성시경의 먹을텐데" && r.tvShow.includes("먹을텐데")) ||
      (selectedShow === "최자로드" && r.tvShow.includes("최자로드")) ||
      (selectedShow === "홍석천 이원일" && r.tvShow.includes("홍석천")) ||
      (selectedShow === "천하제빵 / 베이커리" && (r.tvShow.includes("천하제빵") || r.tvShow.includes("베이커리"))) ||
      (selectedShow === "전지적 참견 시점" && (r.tvShow.includes("전지적") || r.tvShow.includes("전참시"))) ||
      (selectedShow === "놀라운 토요일" && (r.tvShow.includes("놀라운") || r.tvShow.includes("놀토"))) ||
      (selectedShow === "생생정보통" && r.tvShow.includes("생생정보")) ||
      (selectedShow === "오늘 뭐 먹지?" && r.tvShow.includes("오늘 뭐 먹지"));
    const categoryMatch = selectedCategory === "All" || r.category === selectedCategory;
    return showMatch && categoryMatch;
  });

  const sortedRestaurants = [...filteredRestaurants].sort((a, b) => {
    const distA = getDistance(centerLat, centerLng, a.latitude, a.longitude);
    const distB = getDistance(centerLat, centerLng, b.latitude, b.longitude);

    if (sortBy === "distance") {
      return distA - distB;
    } else if (sortBy === "rating") {
      return b.rating - a.rating;
    } else {
      return a.name.localeCompare(b.name, "ko");
    }
  });

  return (
    <div id="tv-gourmet-app" className="flex flex-col h-screen w-full bg-[#fafafb] text-slate-800 font-sans overflow-hidden">
      
      {/* 1. Header Navigation Rail */}
      <header id="app-header" className="bg-white border-b border-slate-100 px-4 py-2.5 md:px-6 md:py-3.5 flex flex-shrink-0 flex-col md:flex-row md:items-center justify-between gap-3 z-40 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-rose-100 shrink-0">
            <Tv className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-extrabold text-lg tracking-tight text-slate-900">On Air Eats</h1>
              <span className="text-[9px] font-extrabold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-rose-500 text-white shadow-2xs">Live AI</span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-400 font-medium">실시간 AI 검증 완료 방송 출연 명소 탐색기</p>
          </div>
        </div>

        {/* Dynamic Search Box with Sub Suggestion Dropdown */}
        <div className="flex flex-1 max-w-2xl gap-2 w-full md:w-auto relative" ref={searchBoxRef}>
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="address-search-input"
              type="text"
              placeholder="지역명, 지하철역, 주소 검색 (예: 망원역, 해운대)"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setSuggestionsOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleQuerySearch(searchText);
                }
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-sm transition-all"
            />
            {searchText && (
              <button 
                onClick={() => { setSearchText(""); setSuggestions([]); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                지우기
              </button>
            )}

            {/* Suggestions drop-down list */}
            <AnimatePresence>
              {suggestionsOpen && (suggestions.length > 0 || suggestionsLoading) && (
                <motion.div
                  id="autocomplete-dropdown"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 text-xs text-slate-700"
                >
                  {suggestionsLoading ? (
                    <div className="p-4 flex items-center justify-center gap-2 text-slate-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>추천 주소 수신 중...</span>
                    </div>
                  ) : (
                    <ul className="p-1 divide-y divide-slate-50">
                      {suggestions.map((item) => (
                        <li key={item.place_id}>
                          <button
                            type="button"
                            onClick={() => handleSuggestionClick(item)}
                            className="w-full text-left px-4 py-2.5 hover:bg-rose-50/40 hover:text-rose-600 flex items-start gap-2.5 transition-all"
                          >
                            <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                            <div>
                              <p className="font-semibold text-slate-800 line-clamp-1">{item.display_name.split(",").reverse().join(" ")}</p>
                              <span className="text-[10px] text-slate-400">한국 주소 정보 매핑</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            id="query-search-button"
            type="button"
            onClick={() => handleQuerySearch(searchText)}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 shrink-0 shadow-md transition-all cursor-pointer"
          >
            <span>검색</span>
          </button>

          <button
            id="gps-location-button"
            type="button"
            onClick={handleGeolocationClick}
            disabled={loading}
            className="p-2.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 rounded-xl flex items-center justify-center shrink-0 border border-rose-100 transition-all cursor-pointer shadow-sm hover:shadow"
            title="내 현재 GPS 위치 주변 맛집 찾기"
          >
            <Compass className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className="flex-1 w-full bg-[#fafafb] flex flex-col items-center overflow-hidden relative">
        
        {/* Loading overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div 
              id="loading-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/90 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 mb-4 shadow-md animate-bounce">
                <Tv className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                성공적으로 수신 중...
              </h3>
              <p className="text-sm mt-1.5 text-slate-500 max-w-md antialiased font-medium">{statusMessage}</p>
              
              <div className="mt-6 flex gap-1 items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse delay-75"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse delay-150"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-300 animate-pulse delay-300"></span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Centered Results Feed Panel */}
        <section id="results-panel" className="w-full max-w-2xl bg-white border-x border-slate-100 flex flex-col h-full overflow-hidden mx-auto shadow-xs">
          
          {/* Target searched coordinates block */}
          <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <p className="text-sm font-bold text-slate-800 line-clamp-1">{locationName}</p>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100 font-mono flex items-center gap-1">
              <Utensils className="w-3 h-3 text-rose-500" />
              총 {restaurants.length}개 발견
            </span>
          </div>

          {/* Quick Toolbar (Filter Trigger only) */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex gap-2 shrink-0 items-center justify-between bg-white h-12">
            <button
              type="button"
              onClick={() => setShowFiltersMobile(!showFiltersMobile)}
              className={`text-xs py-1.5 px-3.5 rounded-lg border flex items-center gap-2 font-bold transition-all cursor-pointer ${
                showFiltersMobile 
                  ? "bg-rose-50 border-rose-200 text-rose-600 shadow-2xs" 
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>검색 필터 및 정렬 방식</span>
            </button>

            {userLat && (
              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-md animate-pulse">
                실시간 위치 가동 중
              </span>
            )}
          </div>

          {/* Sub menu filters box expandable */}
          <AnimatePresence>
            {showFiltersMobile && (
              <motion.div
                id="filter-expander"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-slate-50 border-b border-slate-100 overflow-hidden shrink-0"
              >
                <div className="p-4 space-y-3.5">
                  {/* Row A: TV Shows selection */}
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-400 block mb-1.5 uppercase font-mono">출연 방송 프로그램</label>
                    <div className="flex flex-wrap gap-1">
                      {availableShows.map((show) => (
                        <button
                          key={show}
                          type="button"
                          onClick={() => setSelectedShow(show)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-all ${
                            selectedShow === show 
                              ? "bg-rose-500 text-white shadow-xs" 
                              : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {show === "All" ? "모든 방송" : show}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row B: Foods category list selection */}
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-400 block mb-1.5 uppercase font-mono">음식 카테고리</label>
                    <div className="flex flex-wrap gap-1">
                      {availableCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-all ${
                            selectedCategory === cat 
                              ? "bg-slate-800 text-white shadow-xs" 
                              : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                          }`}
                        >
                          {cat === "All" ? "모든 요리" : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Row C: Sorting standard buttons */}
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-400 block mb-1.5 uppercase font-mono">정렬 기준</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSortBy("distance")}
                        className={`flex-1 text-xs font-bold py-1.5 rounded border transition-all text-center ${
                          sortBy === "distance" 
                            ? "bg-slate-800 text-white border-slate-800" 
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        거리순 (중심지 기준)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy("rating")}
                        className={`flex-1 text-xs font-bold py-1.5 rounded border transition-all text-center ${
                          sortBy === "rating" 
                            ? "bg-slate-800 text-white border-slate-800" 
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        평점 높은순
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortBy("name")}
                        className={`flex-1 text-xs font-bold py-1.5 rounded border transition-all text-center ${
                          sortBy === "name" 
                            ? "bg-slate-800 text-white border-slate-800" 
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        가나다순
                      </button>
                    </div>
                  </div>

                  {/* Row D: Gemini AI Live Verification Settings & Status */}
                  <div className="pt-3 border-t border-slate-200 mt-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold text-rose-500 uppercase font-mono tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Gemini AI 실시간 탐색 및 연동 상태
                      </label>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isGeminiActive 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}>
                        {isGeminiActive ? "🟢 AI 실시간 작동중" : "⚪ 로컬 DB 대기중"}
                      </span>
                    </div>

                    {/* API Key Health Feedback */}
                    <div className="bg-white rounded-lg p-2.5 border border-slate-100 text-[11px] space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">서버 API Key 연동:</span>
                        {hasServerApiKey ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            🟢 연결됨 ({serverKeyPrefix})
                          </span>
                        ) : (
                          <span className="text-amber-600 font-bold flex items-center gap-1">
                            🟡 미등록 (기본 로컬 데이터만 활성)
                          </span>
                        )}
                      </div>

                      {/* Helpful Guide if server key is missing */}
                      {!hasServerApiKey && !customApiKey && (
                        <div className="text-[10px] text-slate-500 leading-relaxed bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60 mt-1 space-y-1">
                          <p className="font-semibold text-amber-800">💡 API Key 설정 및 반영 방법:</p>
                          <p>1. 우측 상단 <strong>Settings &gt; Secrets</strong> 메뉴에서 <code>GEMINI_API_KEY</code>를 등록해 주세요.</p>
                          <p className="text-rose-600 font-semibold">2. ⚠️ 중요: 등록 후 반드시 우측 하단에서 개발 서버를 재시작해주셔야 새로운 환경변수가 로드됩니다!</p>
                          <p>3. 또는 바로 아래 <strong>"개인 Gemini API Key 등록"</strong> 칸에 키를 직접 입력하시면 서버 재시작 없이 즉시 사용하실 수 있습니다.</p>
                        </div>
                      )}

                      {/* Last Gemini Action Result or Error Log */}
                      {geminiError && (
                        <div className="mt-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800 leading-relaxed space-y-1">
                          <p className="font-extrabold flex items-center gap-1.5 text-rose-700">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500 animate-bounce" />
                            <span>Gemini AI 탐색 제한 안내</span>
                          </p>
                          <div className="text-[10.5px] font-medium leading-relaxed">
                            {geminiError === "QUOTA_LIMIT" ? (
                              <p>
                                <strong>⚠️ 하루 호출 한도 초과:</strong> 무료 체험용 일일 호출 쿼터(20회)가 초과되었습니다. 
                                잠시 후 다시 시도하시거나, 아래에 <strong>개인 Gemini API Key</strong>를 직접 입력하시면 즉시 한도 복구되어 계속 탐색하실 수 있습니다!
                              </p>
                            ) : geminiError === "HIGH_DEMAND" ? (
                              <p>
                                <strong>⚠️ 모델 트래픽 폭주 (503):</strong> 현재 Gemini 무료 서버 모델 이용자가 많아 일시적으로 요청이 거절되었습니다. 
                                약 10~20초 후 상단의 <strong>다시 탐색하기</strong> 버튼을 누르시면 대부분 정상 복구됩니다.
                              </p>
                            ) : geminiError === "INVALID_API_KEY" ? (
                              <p>
                                <strong>⚠️ 유효하지 않은 API Key:</strong> 등록된 Gemini API Key가 유효하지 않거나 잘못 복사되었습니다. 
                                입력하신 API Key에 공백이나 특수기호가 섞여있지 않은지 다시 한번 검토해 주세요.
                              </p>
                            ) : (
                              <div>
                                <p><strong>⚠️ API 호출 실패 상세:</strong></p>
                                <p className="mt-1 font-mono break-all bg-white/70 p-1.5 rounded border border-rose-200/60 text-[10px] text-rose-900 select-all">
                                  {geminiError}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Interactive override settings */}
                    <div className="space-y-2">
                      {/* Personal Key Override Input */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-slate-500">개인 Gemini API Key 등록 (선택/클라이언트용)</label>
                          {customApiKey && (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomApiKey("");
                                localStorage.removeItem("user_gemini_api_key");
                              }}
                              className="text-[10px] text-rose-500 font-bold hover:underline"
                            >
                              키 초기화
                            </button>
                          )}
                        </div>
                        <input
                          type="password"
                          placeholder="AI Studio에서 발급한 개인 API Key(AIzaSy...)를 입력하여 덮어쓰기"
                          value={customApiKey}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setCustomApiKey(val);
                            localStorage.setItem("user_gemini_api_key", val);
                          }}
                          className="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/10 focus:border-rose-500 font-mono transition-all"
                        />
                      </div>

                      {/* Favorite Food Style Keyword */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1">
                          나의 맞춤형 음식 스타일/메뉴 (AI 라이브 필터 검색 반영)
                        </label>
                        <input
                          type="text"
                          placeholder="예: 매운 짬뽕, 성시경 먹방, 야포, 백반, 노포 분위기"
                          value={favoriteStyle}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFavoriteStyle(val);
                            localStorage.setItem("user_favorite_style", val);
                          }}
                          className="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/10 focus:border-rose-500 transition-all"
                        />
                        <p className="text-[9px] text-slate-400 mt-0.5">※ 입력 후 상단 검색 버튼이나 엔터를 누르면 AI가 이 스타일을 반영하여 주변 맛집을 엄선합니다.</p>
                      </div>

                      {/* Force Recalculate/Search Trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          fetchTVRestaurants({ 
                            query: locationName === "서울 마포구 망원동" ? "서울 망원동" : locationName, 
                            latitude: centerLat, 
                            longitude: centerLng,
                            force: true
                          });
                        }}
                        className="w-full mt-1.5 py-2 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 active:scale-[0.99] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                        <span>입력된 설정으로 AI 실시간 다시 탐색하기</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Restaurant Cards Feed Container */}
          <div id="cards-container" className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/30 font-sans">
            {error && (
              <div id="error-banner" className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-xs text-center space-y-2">
                <AlertCircle className="w-5 h-5 mx-auto text-orange-500 animate-bounce" />
                <p className="font-semibold">{error}</p>
                <p className="text-[10px] text-orange-600">지도가 정지했나요? 상단의 검색창에 원하시는 지역명(예: 용산, 마포)을 정밀 입력해 보십시오.</p>
              </div>
            )}

            {sortedRestaurants.length === 0 && !error && !loading ? (
              <div className="py-12 px-6 text-center space-y-2">
                <Utensils className="w-8 h-8 mx-auto text-slate-300" />
                <p className="font-bold text-slate-500">필터 조건에 부합하는 맛집이 없습니다.</p>
                <p className="text-[11px] text-slate-400">다른 프로그램이나 요리 종류를 다시 선택해 주세요.</p>
                <button
                  type="button"
                  onClick={() => { setSelectedShow("All"); setSelectedCategory("All"); }}
                  className="text-xs bg-rose-50 text-rose-600 font-bold px-3 py-1.5 rounded border border-rose-100 hover:bg-rose-100 mt-3 transition-colors cursor-pointer"
                >
                  모든 필터 초기화
                </button>
              </div>
            ) : (
              sortedRestaurants.map((restaurant) => {
                const isSelected = selectedRestaurant?.id === restaurant.id;
                const distance = getDistance(centerLat, centerLng, restaurant.latitude, restaurant.longitude);
                
                // Color badges matching map layout legend
                let tagColor = "bg-rose-50 text-rose-600 border-rose-100";
                let borderAccentColor = "border-l-rose-500";
                const show = restaurant.tvShow;
                
                if (show.includes("또간집")) {
                  tagColor = "bg-amber-50 text-amber-600 border-amber-100";
                  borderAccentColor = "border-l-amber-500";
                } else if (show.includes("3대천왕") || show.includes("3대 천왕")) {
                  tagColor = "bg-orange-50 text-orange-600 border-orange-100";
                  borderAccentColor = "border-l-orange-500";
                } else if (show.includes("수요미식회")) {
                  tagColor = "bg-emerald-50 text-emerald-600 border-emerald-100";
                  borderAccentColor = "border-l-emerald-500";
                } else if (show.includes("달인")) {
                  tagColor = "bg-blue-50 text-blue-600 border-blue-100";
                  borderAccentColor = "border-l-blue-500";
                } else if (show.includes("맛있는 녀석들")) {
                  tagColor = "bg-violet-50 text-violet-600 border-violet-100";
                  borderAccentColor = "border-l-violet-500";
                } else if (show.includes("백반기행")) {
                  tagColor = "bg-teal-50 text-teal-600 border-teal-100";
                  borderAccentColor = "border-l-teal-500";
                } else if (show.includes("먹을텐데")) {
                  tagColor = "bg-slate-100 text-slate-700 border-slate-200";
                  borderAccentColor = "border-l-slate-600";
                }

                return (
                  <motion.div
                    key={restaurant.id}
                    id={`restaurant-card-${restaurant.id}`}
                    layoutId={`card-${restaurant.id}`}
                    onClick={() => {
                      setSelectedRestaurant(restaurant);
                      // Center map around this restaurant, keeping original zoom
                      setCenterLat(restaurant.latitude);
                      setCenterLng(restaurant.longitude);
                    }}
                    className={`p-4 rounded-xl border-y border-r border-l-[5px] bg-white cursor-pointer transition-all flex flex-col gap-2.5 ${borderAccentColor} ${
                      isSelected 
                        ? "shadow-md ring-1 ring-slate-200 border-r-slate-200 border-y-slate-200 transform scale-[1.01]" 
                        : "border-y-slate-100 border-r-slate-100 hover:border-y-slate-200 hover:border-r-slate-200 hover:shadow-xs"
                    }`}
                  >
                    {/* Header: Badge & Show info */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {restaurant.isGemini && (
                          <span className="text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-2xs flex items-center gap-1 shrink-0 animate-pulse">
                            <Sparkles className="w-2.5 h-2.5" />
                            AI 실시간 발굴
                          </span>
                        )}
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase transition-colors ${tagColor}`}>
                          {restaurant.tvShow}
                        </span>
                        <span className="text-[10px] bg-slate-50 text-slate-500 font-semibold px-2 py-0.5 rounded border border-slate-100 max-w-[130px] truncate">
                          {restaurant.tvEpisode || "TV 맛집"}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 font-mono flex items-center gap-0.5 text-right shrink-0">
                        <MapPin className="w-2.5 h-2.5 text-rose-400" />
                        {distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`}
                      </span>
                    </div>

                    {/* Middle: Title, Type, Rating */}
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-rose-500 transition-colors">
                          {restaurant.name}
                        </h4>
                        <div className="flex items-center gap-0.5 text-amber-500 text-xs font-bold ml-1 flex-shrink-0">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          <span>{restaurant.rating.toFixed(1)}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500 font-medium">
                        <span>{restaurant.category}</span>
                        <span>•</span>
                        <span className="text-slate-700 font-semibold truncate leading-none">
                          대표: {restaurant.menu}
                        </span>
                      </div>
                    </div>

                    {/* Highlights: Featured reason */}
                    <div className="text-[11px] text-slate-600 font-semibold bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                      💡 {restaurant.featuredReason}
                    </div>

                    {/* Expandable info block */}
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="border-t border-slate-100 pt-3.5 mt-1 space-y-2.5 text-xs text-slate-600"
                      >
                        <p className="leading-relaxed bg-rose-50/20 p-2.5 rounded-lg border border-rose-100/30 text-slate-700">
                          {restaurant.description}
                        </p>

                        <div className="space-y-1 text-[11px] text-slate-500 font-sans">
                          <div className="flex items-start gap-1">
                            <span className="font-bold text-slate-400 shrink-0">주소:</span>
                            <span className="font-medium text-slate-700">{restaurant.address}</span>
                          </div>
                          {restaurant.tel && (
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-slate-400 shrink-0">전화:</span>
                              <a href={`tel:${restaurant.tel}`} className="text-rose-600 font-bold hover:underline">{restaurant.tel}</a>
                            </div>
                          )}
                        </div>

                        {/* Navigation link triggers using store name with location context for perfect matches */}
                        {(() => {
                          const addrParts = restaurant.address.split(" ");
                          const cityRegion = addrParts.slice(0, 3).filter(p => !p.match(/\d/)).join(" ");
                          const queryKeyword = `${cityRegion} ${restaurant.name}`;
                          return (
                            <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100">
                              <a
                                href={`https://map.naver.com/v5/search/${encodeURIComponent(queryKeyword)}`}
                                target="_blank"
                                referrerPolicy="no-referrer"
                                className="bg-[#03C75A] hover:bg-[#02b351] font-bold text-[11px] text-white py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 text-center transition-all shadow-xs hover:scale-[1.01]"
                                title="네이버 지도에서 상호명으로 정확히 찾기"
                              >
                                <span>네이버 지도 검색</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              <a
                                href={`https://map.kakao.com/?q=${encodeURIComponent(queryKeyword)}`}
                                target="_blank"
                                referrerPolicy="no-referrer"
                                className="bg-[#FEE500] hover:bg-[#ebd300] font-bold text-[11px] text-slate-900 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 text-center transition-all shadow-xs hover:scale-[1.01]"
                                title="카카오 맵에서 상호명으로 정확히 찾기"
                              >
                                <span>카카오 맵 검색</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          );
                        })()}
                      </motion.div>
                    )}

                    {/* Standard CTA to focus */}
                    {!isSelected && (
                      <div className="flex justify-end pt-1">
                        <span className="text-[10px] text-rose-500 font-bold flex items-center hover:underline">
                          상세보기 <ChevronRight className="w-3 h-3 ml-0.5" />
                        </span>
                      </div>
                    )}

                  </motion.div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
