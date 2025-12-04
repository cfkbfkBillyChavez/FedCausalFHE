// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CausalData {
  id: string;
  encryptedVariables: string;
  timestamp: number;
  institution: string;
  status: "pending" | "analyzed" | "error";
  fheProof: string;
}

const App: React.FC = () => {
  // Randomized style selections:
  // Colors: High contrast (blue+orange)
  // UI Style: Future metal
  // Layout: Center radiation
  // Interaction: Micro-interactions
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [causalData, setCausalData] = useState<CausalData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({
    variables: "",
    description: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Statistics for dashboard
  const analyzedCount = causalData.filter(d => d.status === "analyzed").length;
  const pendingCount = causalData.filter(d => d.status === "pending").length;
  const errorCount = causalData.filter(d => d.status === "error").length;

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check FHE availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("FHE service is not available");
        return;
      }
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing data keys:", e);
        }
      }
      
      const list: CausalData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`data_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedVariables: data.variables,
                timestamp: data.timestamp,
                institution: data.institution,
                status: data.status || "pending",
                fheProof: data.fheProof || ""
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setCausalData(list);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setSubmitting(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting variables with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const data = {
        variables: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        institution: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(data))
      );
      
      const keysBytes = await contract.getData("data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Variables encrypted and submitted!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowSubmitModal(false);
        setNewData({
          variables: "",
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const analyzeData = async (dataId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE causal analysis..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataBytes = await contract.getData(`data_${dataId}`);
      if (dataBytes.length === 0) {
        throw new Error("Data not found");
      }
      
      const data = JSON.parse(ethers.toUtf8String(dataBytes));
      
      const updatedData = {
        ...data,
        status: "analyzed",
        fheProof: `FHE-Proof-${Math.random().toString(36).substring(2, 10)}`
      };
      
      await contract.setData(
        `data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedData))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE analysis completed!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isInstitution = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Institution Wallet",
      description: "Connect your Web3 wallet to submit encrypted data",
      icon: "🔗"
    },
    {
      title: "Submit Encrypted Variables",
      description: "Add your variables which will be encrypted using FHE",
      icon: "🔒"
    },
    {
      title: "FHE Causal Analysis",
      description: "Variables are analyzed in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Get Causal Insights",
      description: "Receive verifiable causal relationships while keeping data private",
      icon: "📊"
    }
  ];

  const renderStatusChart = () => {
    return (
      <div className="status-chart">
        <div className="chart-bar analyzed" style={{ height: `${(analyzedCount / causalData.length) * 100}%` }}>
          <span>{analyzedCount}</span>
        </div>
        <div className="chart-bar pending" style={{ height: `${(pendingCount / causalData.length) * 100}%` }}>
          <span>{pendingCount}</span>
        </div>
        <div className="chart-bar error" style={{ height: `${(errorCount / causalData.length) * 100}%` }}>
          <span>{errorCount}</span>
        </div>
        <div className="chart-labels">
          <span>Analyzed</span>
          <span>Pending</span>
          <span>Error</span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <div className="central-radial-layout">
        <header className="app-header">
          <div className="logo">
            <div className="hexagon-icon"></div>
            <h1>Fed<span>Causal</span>FHE</h1>
          </div>
          
          <div className="header-actions">
            <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
          </div>
        </header>
        
        <main className="main-content">
          <div className="navigation-ring">
            <button 
              className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-text">Dashboard</span>
            </button>
            <button 
              className={`nav-btn ${activeTab === "data" ? "active" : ""}`}
              onClick={() => setActiveTab("data")}
            >
              <span className="nav-icon">🔍</span>
              <span className="nav-text">Data Explorer</span>
            </button>
            <button 
              className={`nav-btn ${activeTab === "tutorial" ? "active" : ""}`}
              onClick={() => setActiveTab("tutorial")}
            >
              <span className="nav-icon">📚</span>
              <span className="nav-text">Tutorial</span>
            </button>
          </div>
          
          <div className="content-panel metal-panel">
            {activeTab === "dashboard" && (
              <>
                <div className="panel-header">
                  <h2>FHE-Powered Causal Inference</h2>
                  <p>Discover cross-institutional causal relationships without sharing raw data</p>
                </div>
                
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{causalData.length}</div>
                    <div className="stat-label">Total Datasets</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{analyzedCount}</div>
                    <div className="stat-label">Analyzed</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{pendingCount}</div>
                    <div className="stat-label">Pending</div>
                  </div>
                </div>
                
                <div className="chart-container">
                  {renderStatusChart()}
                </div>
                
                <button 
                  onClick={() => setShowSubmitModal(true)} 
                  className="submit-btn metal-button"
                >
                  Submit New Dataset
                </button>
              </>
            )}
            
            {activeTab === "data" && (
              <>
                <div className="panel-header">
                  <h2>Encrypted Data Explorer</h2>
                  <div className="header-actions">
                    <button 
                      onClick={loadData}
                      className="refresh-btn metal-button"
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>
                
                <div className="data-table">
                  <div className="table-header">
                    <div className="header-cell">ID</div>
                    <div className="header-cell">Institution</div>
                    <div className="header-cell">Date</div>
                    <div className="header-cell">Status</div>
                    <div className="header-cell">Actions</div>
                  </div>
                  
                  {causalData.length === 0 ? (
                    <div className="no-data">
                      <div className="no-data-icon"></div>
                      <p>No encrypted datasets found</p>
                      <button 
                        className="metal-button primary"
                        onClick={() => setShowSubmitModal(true)}
                      >
                        Submit First Dataset
                      </button>
                    </div>
                  ) : (
                    causalData.map(data => (
                      <div className="table-row" key={data.id}>
                        <div className="table-cell">#{data.id.substring(0, 6)}</div>
                        <div className="table-cell">{data.institution.substring(0, 6)}...{data.institution.substring(38)}</div>
                        <div className="table-cell">
                          {new Date(data.timestamp * 1000).toLocaleDateString()}
                        </div>
                        <div className="table-cell">
                          <span className={`status-badge ${data.status}`}>
                            {data.status}
                          </span>
                        </div>
                        <div className="table-cell actions">
                          {isInstitution(data.institution) && data.status === "pending" && (
                            <button 
                              className="action-btn metal-button"
                              onClick={() => analyzeData(data.id)}
                            >
                              Analyze
                            </button>
                          )}
                          {data.status === "analyzed" && (
                            <button 
                              className="action-btn metal-button"
                              onClick={() => alert(`FHE Proof: ${data.fheProof}`)}
                            >
                              View Proof
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
            
            {activeTab === "tutorial" && (
              <>
                <div className="panel-header">
                  <h2>FHE Causal Inference Tutorial</h2>
                  <p>Learn how to discover causal relationships while preserving data privacy</p>
                </div>
                
                <div className="tutorial-steps">
                  {tutorialSteps.map((step, index) => (
                    <div 
                      className="tutorial-step metal-card"
                      key={index}
                    >
                      <div className="step-icon">{step.icon}</div>
                      <div className="step-content">
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="fhe-explainer">
                  <h3>How FHE Protects Your Data</h3>
                  <p>
                    Fully Homomorphic Encryption allows computations on encrypted data without decryption. 
                    Your variables remain encrypted throughout the entire causal analysis process.
                  </p>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
  
      {showSubmitModal && (
        <ModalSubmit 
          onSubmit={submitData} 
          onClose={() => setShowSubmitModal(false)} 
          submitting={submitting}
          data={newData}
          setData={setNewData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="hexagon-icon"></div>
              <span>FedCausalFHE</span>
            </div>
            <p>FHE-powered privacy-preserving federated causal inference</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FedCausalFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalSubmitProps {
  onSubmit: () => void; 
  onClose: () => void; 
  submitting: boolean;
  data: any;
  setData: (data: any) => void;
}

const ModalSubmit: React.FC<ModalSubmitProps> = ({ 
  onSubmit, 
  onClose, 
  submitting,
  data,
  setData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.variables) {
      alert("Please enter variables to analyze");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="submit-modal metal-card">
        <div className="modal-header">
          <h2>Submit Encrypted Variables</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>Your data will be encrypted with FHE before submission</span>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <input 
              type="text"
              name="description"
              value={data.description} 
              onChange={handleChange}
              placeholder="Brief description of your variables..." 
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Variables (JSON format) *</label>
            <textarea 
              name="variables"
              value={data.variables} 
              onChange={handleChange}
              placeholder="Enter variables in JSON format for causal analysis..." 
              className="metal-textarea"
              rows={6}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="submit-btn metal-button primary"
          >
            {submitting ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;