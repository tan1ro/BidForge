import { BrowserRouter, Routes, Route, Navigate, Link as RouterLink, useLocation } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import bidForgeLogo from "./assets/bidforge-logo.svg";
import RFQList from './pages/RFQList';
import CreateRFQ from './pages/CreateRFQ';
import AuctionDetail from './pages/AuctionDetail';
import BuyerMetrics from "./pages/BuyerMetrics";
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import Home from "./pages/Home";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import ServerError from "./pages/ServerError";
import SupplierMyAuctions from "./pages/SupplierMyAuctions";

function AppShell({ session, isAuthenticated, onLogout, themeMode, onToggleTheme, children }) {
  const [open, setOpen] = useState(false);
  const [publicOpen, setPublicOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const location = useLocation();
  const navItems = [
    { label: "Auctions", path: "/auctions", icon: <GavelOutlinedIcon fontSize="small" /> },
    { label: "Profile", path: "/profile", icon: <AccountCircleOutlinedIcon fontSize="small" /> },
    ...(session.role === "buyer"
      ? [
          { label: "Create RFQ", path: "/create", icon: <AddCircleOutlineIcon fontSize="small" /> },
          { label: "Metrics", path: "/metrics", icon: <InsightsOutlinedIcon fontSize="small" /> },
        ]
      : [{ label: "My bids", path: "/my-bids", icon: <LocalShippingOutlinedIcon fontSize="small" /> }]),
  ];

  if (!isAuthenticated) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "background.default" }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: "1px solid", borderColor: "divider", top: 0 }}
        >
          <Toolbar sx={{ minHeight: 72 }}>
            <IconButton edge="start" sx={{ display: { md: "none" }, mr: 1 }} onClick={() => setPublicOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ flexGrow: 1 }}>
              <Box
                component="img"
                src={bidForgeLogo}
                alt="BidForge logo"
                sx={{ width: 34, height: 34, objectFit: "contain", borderRadius: 1 }}
              />
              <Typography
                component={RouterLink}
                to="/"
                variant="h6"
                sx={{
                  textDecoration: "none",
                  fontWeight: 700,
                  fontFamily: "Space Grotesk, Inter, sans-serif",
                  color: "primary.main",
                }}
              >
                BidForge
              </Typography>
            </Stack>
            <Box sx={{ display: { xs: "none", md: "flex" }, gap: 0.8, mr: 1.4 }}>
              <Button component={RouterLink} to="/" color="inherit">
                Home
              </Button>
              <Button component={RouterLink} to="/login" color="inherit">
                Login
              </Button>
              <Button component={RouterLink} to="/signup" variant="contained">
                Signup
              </Button>
            </Box>
            <IconButton onClick={onToggleTheme} aria-label="Toggle theme">
              {themeMode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
          </Toolbar>
        </AppBar>
        <Drawer anchor="left" open={publicOpen} onClose={() => setPublicOpen(false)}>
          <Box sx={{ width: 280, py: 2 }}>
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ px: 2 }}>
              <Box
                component="img"
                src={bidForgeLogo}
                alt="BidForge logo"
                sx={{ width: 30, height: 30, objectFit: "contain", borderRadius: 1 }}
              />
              <Typography variant="h6">BidForge</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, mt: 0.5, mb: 1.5 }}>
              British Auction RFQ Platform
            </Typography>
            <Divider />
            <List>
              <ListItemButton component={RouterLink} to="/" onClick={() => setPublicOpen(false)} selected={location.pathname === "/"}>
                <ListItemText primary="Home" />
              </ListItemButton>
              <ListItemButton component={RouterLink} to="/login" onClick={() => setPublicOpen(false)} selected={location.pathname === "/login"}>
                <ListItemText primary="Login" />
              </ListItemButton>
              <ListItemButton component={RouterLink} to="/signup" onClick={() => setPublicOpen(false)} selected={location.pathname === "/signup"}>
                <ListItemText primary="Signup" />
              </ListItemButton>
            </List>
          </Box>
        </Drawer>
        <Box sx={{ flex: 1 }}>
          {children}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.default" }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: "1px solid", borderColor: "divider", top: 0 }}
      >
        <Toolbar sx={{ minHeight: 72 }}>
          <IconButton edge="start" sx={{ display: { md: "none" }, mr: 1 }} onClick={() => setOpen(true)}>
            <MenuIcon />
          </IconButton>
          <Stack
            component={RouterLink}
            to={isAuthenticated ? "/auctions" : "/"}
            direction="row"
            spacing={1.2}
            alignItems="center"
            sx={{ textDecoration: "none", flexGrow: 1 }}
          >
            <Box
              component="img"
              src={bidForgeLogo}
              alt="BidForge logo"
              sx={{ width: 34, height: 34, objectFit: "contain", borderRadius: 1 }}
            />
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontFamily: "Space Grotesk, Inter, sans-serif",
                color: "primary.main",
              }}
            >
              BidForge
            </Typography>
          </Stack>
          <Chip
            size="small"
            label={session.role === "buyer" ? "Buyer Workspace" : "Supplier Workspace"}
            color="secondary"
            sx={{ display: { xs: "none", md: "inline-flex" }, mr: 1.5 }}
          />
          <IconButton onClick={onToggleTheme} sx={{ mr: 1 }} aria-label="Toggle theme">
            {themeMode === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
          </IconButton>
          <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1, mr: 2 }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                component={RouterLink}
                to={item.path}
                variant={location.pathname === item.path ? "contained" : "text"}
                startIcon={item.icon}
                sx={{ px: 1.8 }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
          <Avatar sx={{ width: 34, height: 34, mr: 1.2 }}>{(session.companyName || "U").slice(0, 1).toUpperCase()}</Avatar>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={() => setConfirmLogout(true)}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 280, py: 2 }}>
          <Typography variant="h6" sx={{ px: 2, mb: 0.5 }}>Menu</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, mb: 1.5 }}>
            Navigate your workspace
          </Typography>
          <List>
            {navItems.map((item) => (
              <ListItemButton
                key={item.path}
                component={RouterLink}
                to={item.path}
                selected={location.pathname === item.path}
                onClick={() => setOpen(false)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
      <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 3.5 } }}>{children}</Container>
      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)}>
        <DialogTitle>Confirm Logout</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to log out?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLogout(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              setConfirmLogout(false);
              onLogout();
            }}
          >
            Logout
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function App({ themeMode, onToggleTheme }) {
  const [session, setSession] = useState(() => ({
    token: localStorage.getItem('auth_token'),
    role: localStorage.getItem('auth_role'),
    companyName: localStorage.getItem('auth_company_name'),
  }));

  const isAuthenticated = useMemo(() => Boolean(session.token), [session.token]);

  function handleLogout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_company_name');
    setSession({ token: null, role: null, companyName: null });
  }

  return (
    <BrowserRouter>
      <AppShell
        session={session}
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
        themeMode={themeMode}
        onToggleTheme={onToggleTheme}
      >
          <Routes>
            <Route
              path="/login"
              element={
                isAuthenticated ? (
                  <Navigate to="/auctions" replace />
                ) : (
                  <Login onLogin={({ role, companyName }) => setSession({ token: localStorage.getItem('auth_token'), role, companyName })} />
                )
              }
            />
            <Route
              path="/signup"
              element={
                isAuthenticated ? (
                  <Navigate to="/auctions" replace />
                ) : (
                  <Signup onSignup={({ role, companyName }) => setSession({ token: localStorage.getItem('auth_token'), role, companyName })} />
                )
              }
            />
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/auctions" element={isAuthenticated ? <RFQList role={session.role} /> : <Navigate to="/login" replace />} />
            <Route path="/profile" element={isAuthenticated ? <Profile /> : <Navigate to="/login" replace />} />
            <Route
              path="/create"
              element={isAuthenticated && session.role === 'buyer' ? <CreateRFQ /> : <Navigate to="/auctions" replace />}
            />
            <Route
              path="/metrics"
              element={isAuthenticated && session.role === "buyer" ? <BuyerMetrics /> : <Navigate to="/auctions" replace />}
            />
            <Route
              path="/my-bids"
              element={
                isAuthenticated && session.role === "supplier" ? <SupplierMyAuctions /> : <Navigate to="/auctions" replace />
              }
            />
            <Route path="/auction/:id" element={isAuthenticated ? <AuctionDetail role={session.role} /> : <Navigate to="/login" replace />} />
            <Route path="/500" element={<ServerError />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

export default App;
