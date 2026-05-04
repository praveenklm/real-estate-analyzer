import React, { useState } from 'react';
import { Search, MapPin, Building, DollarSign, Send, FileDown, ChevronDown, Bot, User, Home, ArrowRight, X, ExternalLink } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function App() {
  const [properties, setProperties] = useState([]);
  const [crawledWebsites, setCrawledWebsites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'agent', content: "Hello! I am your AI Real Estate Agent for India. How can I assist you today?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [propertySummary, setPropertySummary] = useState(null);
  const [propertySummaryLoading, setPropertySummaryLoading] = useState(false);
  
  const [displayCurrency, setDisplayCurrency] = useState('INR');
  const [formData, setFormData] = useState({
    zipCode: "400001",
    radius: 5.0,
    minBudget: 5000000,
    maxBudget: 30000000,
    minSqft: 500,
    minSqft: 500,
    maxSqft: 2000,
    minBedrooms: 1,
    maxBedrooms: 5,
    dataSource: "ai"
  });

  const [sortBy, setSortBy] = useState("price_asc");

  const formatPrice = (price, originalCurrency, targetCurrency) => {
    const exchangeRate = 83; // 1 USD = 83 INR
    let convertedPrice = price;
    
    // Default mock data is INR if not specified
    const baseCurrency = originalCurrency || 'INR';
    
    if (baseCurrency === 'USD' && targetCurrency === 'INR') {
      convertedPrice = price * exchangeRate;
    } else if (baseCurrency === 'INR' && targetCurrency === 'USD') {
      convertedPrice = price / exchangeRate;
    }
    
    if (targetCurrency === 'INR') {
      if (convertedPrice >= 10000000) {
        return `₹${(convertedPrice / 10000000).toFixed(2)} Cr`;
      }
      return `₹${(convertedPrice / 100000).toFixed(2)} Lacs`;
    } else {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(convertedPrice);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      // Using relative path so it routes through the Load Balancer
      const response = await fetch(`/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      setProperties(data.properties);
      setCrawledWebsites(data.crawledWebsites);
    } catch (err) {
      console.error("Error fetching properties:", err);
    }
    setLoading(false);
  };

  const handlePropertyClick = async (prop) => {
    setSelectedProperty(prop);
    setPropertySummary(null);
    setPropertySummaryLoading(true);
    
    try {
      const prompt = `Please summarize the following property in 2-3 short, engaging sentences, highlighting its pros based on its price, size, and location. Property Details: ${JSON.stringify(prop)}`;
      const response = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: prompt }], 
          context: JSON.stringify({ intent: "summarize_property" }) 
        })
      });
      const data = await response.json();
      setPropertySummary(data.content);
    } catch (err) {
      setPropertySummary("Failed to generate AI summary.");
    }
    setPropertySummaryLoading(false);
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const newMessages = [...chatMessages, { role: 'user', content: chatInput }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      // Using relative path so it routes through the Load Balancer
      const response = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, context: JSON.stringify(formData) })
      });
      const data = await response.json();
      setChatMessages([...newMessages, data]);
      
      // Basic heuristic: if the agent suggests adjusting search, we trigger search
      if (data.content.toLowerCase().includes('search constraints') || data.content.toLowerCase().includes('found some')) {
        handleSearch();
      }
    } catch (err) {
      console.error("Error in chat:", err);
      setChatMessages([...newMessages, { role: 'agent', content: "Sorry, I am having trouble connecting right now." }]);
    }
    setChatLoading(false);
  };

  const sortedProperties = [...properties].sort((a, b) => {
    if (sortBy === "price_asc") return a.price - b.price;
    if (sortBy === "price_desc") return b.price - a.price;
    if (sortBy === "distance_asc") return a.distance - b.distance;
    if (sortBy === "sqft_desc") return b.sqft - a.sqft;
    return 0;
  });

  const exportReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Real Estate Analysis Report", 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Search Criteria: Zip ${formData.zipCode}, Radius ${formData.radius}km`, 14, 30);
    doc.text(`Budget: ₹${(formData.minBudget/100000).toFixed(1)}L - ₹${(formData.maxBudget/100000).toFixed(1)}L | Area: ${formData.minSqft} - ${formData.maxSqft} sqft`, 14, 36);

    const tableColumn = ["Title", "Location", "Price (₹)", "Beds", "Sqft", "Distance (km)", "Source", "Link"];
    const tableRows = [];

    sortedProperties.forEach(prop => {
      const propData = [
        prop.title,
        prop.location,
        formatPrice(prop.price, prop.currency, displayCurrency),
        prop.bedrooms,
        prop.sqft,
        prop.distance,
        prop.website,
        prop.url
      ];
      tableRows.push(propData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 45,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`real_estate_report_${formData.zipCode}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden font-sans">
      {/* Left Panel: Search & Results */}
      <div className="w-2/3 h-screen overflow-y-auto border-r border-slate-200 bg-white">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white opacity-10 blur-3xl"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
                <Home className="h-8 w-8" /> 
                EstateAI Analyzer
              </h1>
              <p className="text-indigo-100 max-w-xl">Intelligently discover properties across the US and India using advanced data aggregation and AI-driven insights.</p>
            </div>
            
            <div className="flex items-center space-x-1 bg-white/20 backdrop-blur-md rounded-lg p-1.5 border border-white/30">
              <button 
                onClick={() => setDisplayCurrency('USD')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${displayCurrency === 'USD' ? 'bg-white text-indigo-700 shadow-md scale-105' : 'text-indigo-50 hover:bg-white/20'}`}
              >
                USD ($)
              </button>
              <button 
                onClick={() => setDisplayCurrency('INR')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${displayCurrency === 'INR' ? 'bg-white text-indigo-700 shadow-md scale-105' : 'text-indigo-50 hover:bg-white/20'}`}
              >
                INR (₹)
              </button>
            </div>
          </div>
        </div>

        {/* Input Form */}
        <div className="p-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 relative">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Search className="h-5 w-5 text-indigo-500" />
              Search Parameters
            </h2>
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Location (Pincode)</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input type="text" value={formData.zipCode} onChange={e => setFormData({...formData, zipCode: e.target.value})} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="e.g. 400001" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Radius (km)</label>
                <input type="number" value={formData.radius} onChange={e => setFormData({...formData, radius: parseFloat(e.target.value)})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Budget Range (₹)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={formData.minBudget} onChange={e => setFormData({...formData, minBudget: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Min" />
                  <span className="text-slate-400">-</span>
                  <input type="number" value={formData.maxBudget} onChange={e => setFormData({...formData, maxBudget: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Max" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Size (Sqft)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={formData.minSqft} onChange={e => setFormData({...formData, minSqft: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Min" />
                  <span className="text-slate-400">-</span>
                  <input type="number" value={formData.maxSqft} onChange={e => setFormData({...formData, maxSqft: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Max" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600">Bedrooms</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={formData.minBedrooms} onChange={e => setFormData({...formData, minBedrooms: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Min" />
                  <span className="text-slate-400">-</span>
                  <input type="number" value={formData.maxBedrooms} onChange={e => setFormData({...formData, maxBedrooms: parseInt(e.target.value)})} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Max" />
                </div>
              </div>

              <div className="md:col-span-3 flex flex-col md:flex-row justify-between items-center mt-2 border-t border-slate-100 pt-6 gap-4">
                <div className="flex items-center space-x-2 w-full md:w-auto bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, dataSource: 'ai'})}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${formData.dataSource === 'ai' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    🤖 AI Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, dataSource: 'deterministic'})}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${formData.dataSource === 'deterministic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    ⚙️ API Mode
                  </button>
                </div>
                
                <button type="submit" disabled={loading} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg font-bold transition-colors shadow-sm shadow-indigo-200 flex items-center justify-center gap-2">
                  {loading ? (
                    <span className="animate-pulse flex items-center gap-2"><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div> Searching...</span>
                  ) : (
                    <>Search Properties <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Results Area */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  Found Properties <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full text-sm">{properties.length}</span>
                </h2>
                {crawledWebsites.length > 0 && (
                  <div className="mt-2 text-sm text-slate-500 flex flex-wrap items-center gap-1">
                    <span className="font-medium mr-1 text-xs uppercase tracking-wider">Crawled Sources:</span>
                    {crawledWebsites.map((site, i) => (
                      <span key={i} className="inline-flex items-center bg-white shadow-sm text-indigo-600 px-2 py-0.5 rounded-md text-xs font-medium border border-indigo-100">
                        {site}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                <div className="relative">
                  <select 
                    value={sortBy} 
                    onChange={e => setSortBy(e.target.value)}
                    className="appearance-none bg-white border border-slate-200 text-slate-700 py-2 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm shadow-sm"
                  >
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="distance_asc">Distance: Nearest</option>
                    <option value="sqft_desc">Area: Largest First</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
                <button 
                  onClick={exportReport}
                  disabled={properties.length === 0}
                  className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                >
                  <FileDown className="h-4 w-4" />
                  Export Report
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {sortedProperties.length > 0 ? (
                sortedProperties.map(prop => (
                  <div 
                    key={prop.id} 
                    onClick={() => handlePropertyClick(prop)}
                    className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden group cursor-pointer"
                  >
                    <div className="relative h-48 overflow-hidden">
                      <img src={prop.imageUrl} alt={prop.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-indigo-700 shadow-sm">
                        {prop.website}
                      </div>
                      <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-lg text-white font-bold tracking-wide">
                        {formatPrice(prop.price, prop.currency, displayCurrency)}
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-slate-800 text-lg mb-1 truncate" title={prop.title}>{prop.title}</h3>
                        <span className="text-indigo-600 font-bold whitespace-nowrap ml-2">
                          {formatPrice(prop.price, prop.currency, displayCurrency)}
                        </span>
                      </div>
                      <p className="text-slate-500 text-sm mb-4 flex items-center gap-1"><MapPin className="h-3 w-3" /> {prop.location} ({prop.distance} km)</p>
                      
                      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                        <div className="text-center">
                          <p className="text-xs text-slate-400 font-medium mb-1 uppercase tracking-wider">Beds</p>
                          <p className="font-semibold text-slate-700">{prop.bedrooms} BHK</p>
                        </div>
                        <div className="text-center border-l border-slate-100">
                          <p className="text-xs text-slate-400 font-medium mb-1 uppercase tracking-wider">Baths</p>
                          <p className="font-semibold text-slate-700">{prop.bathrooms}</p>
                        </div>
                        <div className="text-center border-l border-slate-100">
                          <p className="text-xs text-slate-400 font-medium mb-1 uppercase tracking-wider">Area</p>
                          <p className="font-semibold text-slate-700">{prop.sqft} sqft</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-16 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-dashed border-slate-200">
                  <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Building className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-800 mb-1">No Properties Found</h3>
                  <p className="text-slate-500 max-w-sm">Adjust your search parameters or ask the AI agent to help you find the right fit.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Chat Interface */}
      <div className="w-1/3 h-screen bg-slate-50 flex flex-col border-l border-slate-200 relative">
        <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center gap-3 shadow-sm z-10">
          <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Agent CoPilot</h2>
            <p className="text-xs text-green-500 font-medium flex items-center gap-1">
              <span className="h-1.5 w-1.5 bg-green-500 rounded-full inline-block"></span> Online
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-sm' 
                  : 'bg-white border border-slate-100 text-slate-700 rounded-bl-sm'
              }`}>
                {msg.role === 'user' ? null : (
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold text-indigo-500 uppercase tracking-wider">
                    <Bot className="h-3 w-3" /> Agent
                  </div>
                )}
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-5 py-4 shadow-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <form onSubmit={handleChat} className="relative flex items-center">
            <input 
              type="text" 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask me to adjust search or analyze data..." 
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-full pl-5 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
            />
            <button 
              type="submit" 
              disabled={chatLoading || !chatInput.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-full flex items-center justify-center transition-colors shadow-sm"
            >
              <Send className="h-4 w-4 ml-0.5" />
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 mt-3 font-medium">Powered by GenAI Models</p>
        </div>
      </div>

      {/* Property Details Modal */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => setSelectedProperty(null)}
          ></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col md:flex-row">
            <button 
              onClick={() => setSelectedProperty(null)}
              className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white text-slate-800 p-2 rounded-full shadow-sm backdrop-blur-md transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="md:w-1/2 relative h-64 md:h-auto">
              <img src={selectedProperty.imageUrl} alt={selectedProperty.title} className="w-full h-full object-cover" />
              <div className="absolute top-4 left-4 bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md uppercase tracking-wide">
                {selectedProperty.website}
              </div>
            </div>
            
            <div className="md:w-1/2 p-8 flex flex-col">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">{selectedProperty.title}</h2>
              <p className="text-slate-500 mb-6 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-indigo-500" /> {selectedProperty.location} 
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full ml-2">{selectedProperty.distance} km away</span>
              </p>
              
              <div className="text-4xl font-black text-indigo-600 mb-6">
                {formatPrice(selectedProperty.price, selectedProperty.currency, displayCurrency)}
              </div>
              
              {/* AI Summary Box */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 mb-6 border border-indigo-100/50 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-indigo-200 rounded-full blur-2xl opacity-50"></div>
                <h3 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-indigo-600" /> AI Agent Summary
                </h3>
                {propertySummaryLoading ? (
                  <div className="flex items-center gap-2 text-sm text-indigo-600/70 font-medium py-2">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                    </div>
                    Analyzing property...
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 leading-relaxed relative z-10">
                    {propertySummary}
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Bedrooms</p>
                  <p className="text-lg font-semibold text-slate-800">{selectedProperty.bedrooms} BHK</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Bathrooms</p>
                  <p className="text-lg font-semibold text-slate-800">{selectedProperty.bathrooms}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Total Area</p>
                  <p className="text-lg font-semibold text-slate-800">{selectedProperty.sqft} sqft</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold tracking-wider text-slate-400 mb-1 uppercase">Price per sqft</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {formatPrice(Math.round(selectedProperty.price / selectedProperty.sqft), selectedProperty.currency, displayCurrency)}
                  </p>
                </div>
              </div>
              
              <div className="mt-auto pt-6 border-t border-slate-100 flex gap-4">
                <a 
                  href={selectedProperty.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-6 rounded-xl font-medium text-center transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  View on External Site <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
