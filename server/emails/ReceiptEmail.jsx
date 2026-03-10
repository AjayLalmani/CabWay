import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Section,
  Row,
  Column,
  Hr,
} from '@react-email/components';

export default function ReceiptEmail({ ride }) {
  const {
    pickup_address,
    dropoff_address,
    fare_amount,
    distance_km,
    created_at,
    id
  } = ride;

  const formattedDate = new Date(created_at).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>CabWay</Text>
          <Text style={heading}>Here's your receipt for your ride</Text>
          <Text style={paragraph}>
            Thanks for riding with CabWay! We hope you enjoyed your trip.
          </Text>

          <Section style={receiptBox}>
            <Row style={row}>
              <Column>
                <Text style={label}>Date</Text>
                <Text style={value}>{formattedDate}</Text>
              </Column>
              <Column align="right">
                <Text style={label}>Ride ID</Text>
                <Text style={value}>{id.split('-')[0]}</Text> /* Show short ID */
              </Column>
            </Row>
            
            <Hr style={hr} />

            <Row style={row}>
              <Column>
                <Text style={label}>Pickup</Text>
                <Text style={value}>{pickup_address || 'Selected Location'}</Text>
              </Column>
            </Row>

            <Row style={row}>
              <Column>
                <Text style={label}>Dropoff</Text>
                <Text style={value}>{dropoff_address || 'Selected Location'}</Text>
              </Column>
            </Row>
            
            <Hr style={hr} />

            <Row style={row}>
              <Column>
                <Text style={label}>Distance</Text>
                <Text style={value}>{distance_km} km</Text>
              </Column>
              <Column align="right">
                <Text style={label}>Total Fare</Text>
                <Text style={total}>${(fare_amount / 100).toFixed(2)}</Text>
              </Column>
            </Row>
          </Section>

          <Text style={footer}>
            If you have any questions about this receipt, simply reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
  maxWidth: '600px',
};

const logo = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#000000',
  marginBottom: '24px',
};

const heading = {
  fontSize: '20px',
  fontWeight: 'bold',
  color: '#333333',
  marginBottom: '10px',
};

const paragraph = {
  fontSize: '16px',
  color: '#555555',
  lineHeight: '1.5',
  marginBottom: '24px',
};

const receiptBox = {
  backgroundColor: '#f9f9f9',
  borderRadius: '8px',
  padding: '24px',
  border: '1px solid #eeeeee',
};

const row = {
  marginBottom: '16px',
};

const label = {
  fontSize: '12px',
  textTransform: 'uppercase',
  color: '#888888',
  fontWeight: 'bold',
  margin: '0 0 4px 0',
};

const value = {
  fontSize: '14px',
  color: '#333333',
  margin: '0',
};

const total = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#000000',
  margin: '0',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const footer = {
  fontSize: '14px',
  color: '#888888',
  marginTop: '32px',
  textAlign: 'center',
};
