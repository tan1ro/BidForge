import { Link as RouterLink } from "react-router-dom";
import { Button, Card, CardContent, Container, Typography } from "@mui/material";

/**
 * Optional portfolio / author context — separate from the product home page.
 */
export default function About() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button component={RouterLink} to="/" color="primary" sx={{ mb: 2 }}>
        Back to home
      </Button>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            About this project
          </Typography>
          <Typography color="text.secondary" paragraph>
            BidForge is a British-auction style RFQ workflow: RFQ Owners publish routes, Bidders bid in rank order,
            and time extensions can apply near the close when configured. This app demonstrates a production-style
            stack (FastAPI, MongoDB, React, MUI) with role-based access and real-time updates.
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}
